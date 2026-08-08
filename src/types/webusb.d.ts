/**
 * webusb.d.ts — Ambient TypeScript declarations for the W3C WebUSB API.
 *
 * The WebUSB spec is implemented in Chrome 61+ but is not yet included in
 * TypeScript's bundled `lib.dom.d.ts` (as of TS 5.x).  These declarations
 * give full type safety to all WebUSB calls without requiring an npm package.
 *
 * Spec reference: https://wicg.github.io/webusb/
 */

// ---------------------------------------------------------------------------
// Core USB types
// ---------------------------------------------------------------------------

interface USBDeviceFilter {
  vendorId?: number;
  productId?: number;
  classCode?: number;
  subclassCode?: number;
  protocolCode?: number;
  serialNumber?: string;
}

interface USBDeviceRequestOptions {
  filters: USBDeviceFilter[];
}

interface USBConnectionEventInit extends EventInit {
  device: USBDevice;
}

declare class USBConnectionEvent extends Event {
  constructor(type: string, eventInitDict: USBConnectionEventInit);
  readonly device: USBDevice;
}

interface USBInTransferResult {
  readonly data: DataView | undefined;
  readonly status: 'ok' | 'stall' | 'babble';
}

interface USBOutTransferResult {
  readonly bytesWritten: number;
  readonly status: 'ok' | 'stall';
}

interface USBIsochronousInTransferPacket {
  readonly data: DataView | undefined;
  readonly status: 'ok' | 'stall' | 'babble';
}

interface USBIsochronousInTransferResult {
  readonly data: DataView | undefined;
  readonly packets: ReadonlyArray<USBIsochronousInTransferPacket>;
}

interface USBIsochronousOutTransferPacket {
  readonly bytesWritten: number;
  readonly status: 'ok' | 'stall';
}

interface USBIsochronousOutTransferResult {
  readonly packets: ReadonlyArray<USBIsochronousOutTransferPacket>;
}

interface USBEndpoint {
  readonly endpointNumber: number;
  readonly direction: 'in' | 'out';
  readonly type: 'bulk' | 'interrupt' | 'isochronous';
  readonly packetSize: number;
}

interface USBAlternateInterface {
  readonly alternateSetting: number;
  readonly interfaceClass: number;
  readonly interfaceSubclass: number;
  readonly interfaceProtocol: number;
  readonly interfaceName: string | undefined;
  readonly endpoints: ReadonlyArray<USBEndpoint>;
}

interface USBInterface {
  readonly interfaceNumber: number;
  readonly alternate: USBAlternateInterface;
  readonly alternates: ReadonlyArray<USBAlternateInterface>;
  readonly claimed: boolean;
}

interface USBConfiguration {
  readonly configurationValue: number;
  readonly configurationName: string | undefined;
  readonly interfaces: ReadonlyArray<USBInterface>;
}

interface USBDevice {
  readonly usbVersionMajor: number;
  readonly usbVersionMinor: number;
  readonly usbVersionSubminor: number;
  readonly deviceClass: number;
  readonly deviceSubclass: number;
  readonly deviceProtocol: number;
  readonly vendorId: number;
  readonly productId: number;
  readonly deviceVersionMajor: number;
  readonly deviceVersionMinor: number;
  readonly deviceVersionSubminor: number;
  readonly manufacturerName: string | undefined;
  readonly productName: string | undefined;
  readonly serialNumber: string | undefined;
  readonly configuration: USBConfiguration | null;
  readonly configurations: ReadonlyArray<USBConfiguration>;
  readonly opened: boolean;

  open(): Promise<void>;
  close(): Promise<void>;
  forget(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  selectAlternateInterface(interfaceNumber: number, alternateSetting: number): Promise<void>;
  controlTransferIn(setup: USBControlTransferParameters, length: number): Promise<USBInTransferResult>;
  controlTransferOut(setup: USBControlTransferParameters, data?: BufferSource): Promise<USBOutTransferResult>;
  clearHalt(direction: 'in' | 'out', endpointNumber: number): Promise<void>;
  transferIn(endpointNumber: number, length: number): Promise<USBInTransferResult>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>;
  isochronousTransferIn(endpointNumber: number, packetLengths: number[]): Promise<USBIsochronousInTransferResult>;
  isochronousTransferOut(endpointNumber: number, data: BufferSource, packetLengths: number[]): Promise<USBIsochronousOutTransferResult>;
  reset(): Promise<void>;
}

interface USBControlTransferParameters {
  requestType: 'standard' | 'class' | 'vendor';
  recipient: 'device' | 'interface' | 'endpoint' | 'other';
  request: number;
  value: number;
  index: number;
}

interface USB extends EventTarget {
  onconnect: ((this: USB, event: USBConnectionEvent) => void) | null;
  ondisconnect: ((this: USB, event: USBConnectionEvent) => void) | null;
  getDevices(): Promise<USBDevice[]>;
  requestDevice(options: USBDeviceRequestOptions): Promise<USBDevice>;
  addEventListener(type: 'connect' | 'disconnect', listener: (event: USBConnectionEvent) => void, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: 'connect' | 'disconnect', listener: (event: USBConnectionEvent) => void, options?: boolean | EventListenerOptions): void;
}

// ---------------------------------------------------------------------------
// Augment the Navigator interface to include `usb`
// ---------------------------------------------------------------------------

interface Navigator {
  readonly usb: USB;
}
