import AppKit
import AVFoundation
import CoreVideo

guard CommandLine.arguments.count >= 4 else {
    fputs("Usage: frames-to-video.swift <frames-directory> <output.mp4> <fps>\n", stderr)
    exit(64)
}

let frameDirectory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
let fps = Int32(CommandLine.arguments[3]) ?? 12
let fileManager = FileManager.default
let frameURLs = try fileManager.contentsOfDirectory(
    at: frameDirectory,
    includingPropertiesForKeys: nil,
    options: [.skipsHiddenFiles]
).filter { $0.pathExtension.lowercased() == "jpg" }.sorted { $0.lastPathComponent < $1.lastPathComponent }

guard let firstFrameURL = frameURLs.first,
      let firstImage = NSImage(contentsOf: firstFrameURL),
      let firstCGImage = firstImage.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("No readable JPEG frames found.\n", stderr)
    exit(65)
}

try? fileManager.removeItem(at: outputURL)

let width = firstCGImage.width
let height = firstCGImage.height
let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
let compression: [String: Any] = [
    AVVideoAverageBitRateKey: 6_500_000,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    AVVideoExpectedSourceFrameRateKey: fps,
    AVVideoMaxKeyFrameIntervalKey: fps * 2,
]
let settings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: compression,
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let attributes: [String: Any] = [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
    kCVPixelBufferCGImageCompatibilityKey as String: true,
    kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
]
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attributes)

guard writer.canAdd(input) else {
    fputs("Video writer cannot add the configured input.\n", stderr)
    exit(66)
}

writer.add(input)
guard writer.startWriting() else {
    throw writer.error ?? NSError(domain: "PwaymentVideo", code: 1)
}
writer.startSession(atSourceTime: .zero)

func pixelBuffer(for image: CGImage) throws -> CVPixelBuffer {
    var optionalBuffer: CVPixelBuffer?
    let status = CVPixelBufferCreate(
        kCFAllocatorDefault,
        width,
        height,
        kCVPixelFormatType_32BGRA,
        attributes as CFDictionary,
        &optionalBuffer
    )
    guard status == kCVReturnSuccess, let buffer = optionalBuffer else {
        throw NSError(domain: "PwaymentVideo", code: Int(status))
    }

    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

    guard let context = CGContext(
        data: CVPixelBufferGetBaseAddress(buffer),
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
    ) else {
        throw NSError(domain: "PwaymentVideo", code: 2)
    }

    context.setFillColor(NSColor.white.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    return buffer
}

for (index, frameURL) in frameURLs.enumerated() {
    while !input.isReadyForMoreMediaData {
        Thread.sleep(forTimeInterval: 0.002)
    }
    guard let image = NSImage(contentsOf: frameURL),
          let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        throw NSError(domain: "PwaymentVideo", code: 3, userInfo: [NSLocalizedDescriptionKey: "Unreadable frame: \(frameURL.path)"])
    }
    let buffer = try pixelBuffer(for: cgImage)
    let presentationTime = CMTime(value: CMTimeValue(index), timescale: fps)
    guard adaptor.append(buffer, withPresentationTime: presentationTime) else {
        throw writer.error ?? NSError(domain: "PwaymentVideo", code: 4)
    }
}

input.markAsFinished()
let semaphore = DispatchSemaphore(value: 0)
writer.finishWriting { semaphore.signal() }
semaphore.wait()

guard writer.status == .completed else {
    throw writer.error ?? NSError(domain: "PwaymentVideo", code: 5)
}

print("Created \(outputURL.path) from \(frameURLs.count) frames at \(fps) fps")
