/**
 * useThermalPrinter.ts — React custom hook for WebUSB thermal printer control.
 *
 * Targets: Epson TM-T20II and compatible TM-series USB printers.
 *
 * ── How to find your printer's Product ID ──────────────────────────────────
 *
 * The Epson Vendor ID (VID) is always 0x04B8 (1208 decimal).
 * The Product ID (PID) varies by model.  To find yours:
 *
 *   macOS:  Apple menu → About This Mac → System Report → USB
 *           Look for "EPSON" device and note "Product ID"
 *
 *   Windows: Device Manager → Universal Serial Bus controllers
 *            Right-click the Epson device → Properties → Details
 *            → Property: "Hardware Ids"  (PID_XXXX)
 *
 *   Linux:  `lsusb` → find line containing "04b8"
 *
 *   Chrome: chrome://usb-internals → "List Devices" tab
 *
 * Common PID values for Epson TM series:
 *   0x0202 — TM-T20
 *   0x0203 — TM-T20II  ← most common
 *   0x0E28 — TM-T20III
 *   0x0114 — TM-T88V
 *   0x0202 — TM-T88IV
 *
 * If you are unsure, pass `filters: [{ vendorId: EPSON_VENDOR_ID }]` to
 * `requestDevice()` without a productId — Chrome will show ALL Epson USB
 * devices and you can pick the right one.
 *
 * ── WebUSB Security model ──────────────────────────────────────────────────
 *
 * `navigator.usb.requestDevice()` MUST be called from a user gesture (button
 * click).  It cannot be called automatically on page load — Chrome will throw
 * a SecurityError.  The "Connect Printer" button in the UI component provides
 * this required user gesture.
 *
 * ── USB Interface & Endpoint ───────────────────────────────────────────────
 *
 * TM-T20II USB descriptor layout (verified with USB sniffer / lsusb -v):
 *   Interface 0  — Printer class (bInterfaceClass = 7)
 *   Endpoint 1   — Bulk OUT (address 0x01) — where we send ESC/POS bytes
 *   Endpoint 2   — Bulk IN  (address 0x82) — for status/response (optional)
 *
 * If `claimInterface` or `selectConfiguration` fails with "Unable to claim
 * interface", make sure no other application (CUPS, Epson driver) holds the
 * interface.  On macOS, disable or remove the Epson driver first.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Epson USB Vendor ID — all Epson printers share this.
 * Hex: 0x04B8 / Decimal: 1208
 */
export const EPSON_VENDOR_ID = 0x04b8;

/**
 * Known Epson TM-series Product IDs.
 *
 * ⚠️  PIDs vary by hardware revision and region — the same model can ship
 *     with different PIDs.  Always verify with `ioreg` or chrome://usb-internals.
 *
 * How to find YOUR printer's PID on macOS:
 *   ioreg -r -n "TM-T20II@00140000" -l -w 0 | grep idProduct
 *   → "idProduct" = 3605  →  hex = 0x0E15
 *
 * @see module doc for the full discovery procedure.
 */
export const EPSON_PRODUCT_IDS = {
  TM_T20:      0x0202,
  TM_T20II:    0x0203, // common revision
  TM_T20II_B:  0x0e15, // ← YOUR unit (idProduct = 3605 = 0x0E15, confirmed via ioreg)
  TM_T20III:   0x0e28,
  TM_T88V:     0x0114,
} as const;

/**
 * USB interface number to claim.
 * TM-T20II exposes one printer-class interface at index 0.
 * If you have a multi-function device, inspect the descriptor first.
 */
const USB_INTERFACE = 0;

/**
 * Bulk-OUT endpoint number for the TM-T20II.
 * This is the "write" endpoint — we send ESC/POS data to it.
 * The value must match the endpoint address in the USB descriptor (0x01).
 */
const BULK_OUT_ENDPOINT = 1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PrinterStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'printing'
  | 'error';

export interface ThermalPrinterHook {
  /** Current printer connection status. */
  status: PrinterStatus;
  /** True when the printer is connected and ready to accept data. */
  isConnected: boolean;
  /** Last error message, if any. Cleared on the next successful operation. */
  error: string | null;
  /**
   * Request USB permission and open the printer connection.
   *
   * Must be called from a user gesture (button click).
   * If `productId` is omitted, Chrome shows all Epson USB devices to pick from.
   */
  connect: (productId?: number) => Promise<void>;
  /** Close the USB connection and release the interface. */
  disconnect: () => Promise<void>;
  /**
   * Send raw ESC/POS bytes to the printer.
   * @throws if not connected or transfer fails.
   */
  sendRaw: (data: Uint8Array) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

/**
 * `useThermalPrinter` — WebUSB custom hook for Epson TM-series printers.
 *
 * @example
 * ```tsx
 * const { isConnected, status, error, connect, sendRaw } = useThermalPrinter();
 *
 * const handleConnect = () => connect(EPSON_PRODUCT_IDS.TM_T20II);
 *
 * const handlePrint = async () => {
 *   const bytes = new EscPosBuilder().init().text('Hello!\n').cut().build();
 *   await sendRaw(bytes);
 * };
 * ```
 */
export function useThermalPrinter(): ThermalPrinterHook {
  const [status, setStatus] = useState<PrinterStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);

  // Persist the USBDevice reference across renders without triggering re-renders.
  const deviceRef = useRef<USBDevice | null>(null);

  // ── Cleanup on unmount ──────────────────────────────────────────────────

  useEffect(() => {
    // Handle "device disconnected" events fired by the browser when the USB
    // cable is unplugged while the page is open.
    const handleDisconnect = (event: USBConnectionEvent) => {
      if (event.device === deviceRef.current) {
        deviceRef.current = null;
        setStatus('disconnected');
        setError('Printer was physically disconnected.');
      }
    };

    if (navigator.usb) {
      navigator.usb.addEventListener('disconnect', handleDisconnect);
    }

    return () => {
      // Release the USB interface when the component unmounts to prevent
      // resource leaks and to allow other applications to reclaim the device.
      if (navigator.usb) {
        navigator.usb.removeEventListener('disconnect', handleDisconnect);
      }
      void releaseDevice();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Internal device release ─────────────────────────────────────────────

  /**
   * Gracefully release the USB interface and close the device.
   * Safe to call even if not connected — silently no-ops.
   */
  const releaseDevice = useCallback(async () => {
    const device = deviceRef.current;
    if (!device) return;
    deviceRef.current = null;

    try {
      if (device.opened) {
        // Always release the claimed interface before closing —
        // otherwise the OS may refuse to release the device to other apps.
        await device.releaseInterface(USB_INTERFACE);
        await device.close();
      }
    } catch {
      // Best-effort cleanup — the device may already be gone (unplugged).
    }
  }, []);

  // ── connect ─────────────────────────────────────────────────────────────

  const connect = useCallback(async (productId?: number) => {
    // Guard: check WebUSB API availability first
    if (!navigator.usb) {
      const msg =
        'WebUSB is not supported in this browser. Use Chrome 61+ on a secure origin (HTTPS or localhost).';
      setError(msg);
      setStatus('error');
      return;
    }

    // Disconnect any existing session before re-connecting
    await releaseDevice();

    setStatus('connecting');
    setError(null);

    try {
      // ── Step 1: Request device (triggers Chrome permission dialog) ───────
      //
      // `requestDevice()` MUST be inside a user-gesture handler (click).
      // Chrome will throw SecurityError if called programmatically.
      //
      // The `filters` array narrows the picker to only Epson printers.
      // If `productId` is provided, we further narrow to that specific model.
      const filters: USBDeviceFilter[] = productId
        ? [{ vendorId: EPSON_VENDOR_ID, productId }]
        : [{ vendorId: EPSON_VENDOR_ID }];

      let device: USBDevice;
      try {
        device = await navigator.usb.requestDevice({ filters });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'NotFoundError') {
          // User cancelled the picker dialog — not an error, just abort quietly.
          setStatus('disconnected');
          return;
        }
        throw err; // Re-throw unexpected errors
      }

      // ── Step 2: Open the device ──────────────────────────────────────────
      await device.open();

      // ── Step 3: Select configuration ────────────────────────────────────
      //
      // Most USB printers have a single configuration (index 1).
      // `selectConfiguration()` is required on some OS/browser combinations
      // before you can claim interfaces.
      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }

      // ── Step 4: Claim the printer interface ──────────────────────────────
      //
      // Claiming interface 0 gives us exclusive access to the bulk endpoints.
      //
      // Common failure: "NetworkError: Unable to claim interface."
      //   → Another process (CUPS, Epson driver, another tab) holds the interface.
      //   → On macOS: System Preferences → Printers — remove the Epson printer
      //     and unload the Epson kernel extension (kextunload).
      try {
        await device.claimInterface(USB_INTERFACE);
      } catch (err) {
        await device.close();
        throw new Error(
          `Could not claim USB interface ${USB_INTERFACE}. ` +
          'Ensure no system printer driver or other application is using the printer. ' +
          `Original error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // ── Step 5: Store the device reference and update state ──────────────
      deviceRef.current = device;
      setStatus('connected');
      setError(null);

    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : `Unexpected USB error: ${String(err)}`;
      setStatus('error');
      setError(msg);
      // Ensure the device is cleaned up even on error
      await releaseDevice();
    }
  }, [releaseDevice]);

  // ── disconnect ──────────────────────────────────────────────────────────

  const disconnect = useCallback(async () => {
    await releaseDevice();
    setStatus('disconnected');
    setError(null);
  }, [releaseDevice]);

  // ── sendRaw ─────────────────────────────────────────────────────────────

  const sendRaw = useCallback(async (data: Uint8Array) => {
    const device = deviceRef.current;

    if (!device || !device.opened) {
      throw new Error(
        'Printer is not connected. Call connect() first from a user-gesture handler.',
      );
    }

    setStatus('printing');
    setError(null);

    try {
      // `transferOut(endpoint, data)`:
      //   - endpoint: the Bulk-OUT endpoint number (not address 0x81, just 1)
      //   - data: any ArrayBuffer or typed array
      //
      // For large receipts, split into chunks of ≤ 512 bytes to avoid
      // USB packet fragmentation issues on some printer firmware versions.
      const CHUNK_SIZE = 512;

      if (data.length <= CHUNK_SIZE) {
        const result = await device.transferOut(BULK_OUT_ENDPOINT, data);
        if (result.status !== 'ok') {
          throw new Error(
            `USB transfer failed. Status: "${result.status}". ` +
            'Check that the printer is online and not in error state.',
          );
        }
      } else {
        // Chunked transfer for large payloads
        let offset = 0;
        while (offset < data.length) {
          const chunk = data.subarray(offset, offset + CHUNK_SIZE);
          const result = await device.transferOut(BULK_OUT_ENDPOINT, chunk);
          if (result.status !== 'ok') {
            throw new Error(
              `USB chunk transfer failed at offset ${offset}. Status: "${result.status}".`,
            );
          }
          offset += CHUNK_SIZE;
        }
      }

      setStatus('connected');

    } catch (err) {
      const msg =
        err instanceof Error ? err.message : `USB transfer error: ${String(err)}`;
      setStatus('error');
      setError(msg);
      throw err; // Re-throw so the caller can handle it
    }
  }, []);

  // ── Return hook API ─────────────────────────────────────────────────────

  return {
    status,
    isConnected: status === 'connected' || status === 'printing',
    error,
    connect,
    disconnect,
    sendRaw,
  };
}
