// アイコンとLINE共有用画像を作る。 実行: swift tools/make-images.swift （tabi-shiori フォルダで）
import AppKit

let paper = NSColor(red: 0.965, green: 0.937, blue: 0.886, alpha: 1)
let card = NSColor(red: 1, green: 0.98, blue: 0.94, alpha: 1)
let ink = NSColor(red: 0.29, green: 0.216, blue: 0.157, alpha: 1)
let terra = NSColor(red: 0.71, green: 0.333, blue: 0.184, alpha: 1)
let green = NSColor(red: 0.31, green: 0.435, blue: 0.322, alpha: 1)
let sand = NSColor(red: 0.902, green: 0.839, blue: 0.722, alpha: 1)

func drawSuitcase(x: CGFloat, y: CGFloat, size s: CGFloat) {
    let line = s * 0.035
    ink.setStroke()
    let handle = NSBezierPath(roundedRect: NSRect(x: x + s * 0.33, y: y + s * 0.68, width: s * 0.34, height: s * 0.22), xRadius: s * 0.05, yRadius: s * 0.05)
    handle.lineWidth = line
    handle.stroke()
    let body = NSBezierPath(roundedRect: NSRect(x: x + s * 0.14, y: y + s * 0.14, width: s * 0.72, height: s * 0.62), xRadius: s * 0.07, yRadius: s * 0.07)
    card.setFill()
    body.fill()
    body.lineWidth = line
    body.stroke()
    terra.setStroke()
    for ratio in [0.3, 0.7] as [CGFloat] {
        let band = NSBezierPath()
        band.move(to: NSPoint(x: x + s * ratio, y: y + s * 0.14))
        band.line(to: NSPoint(x: x + s * ratio, y: y + s * 0.76))
        band.lineWidth = line
        band.stroke()
    }
    let seal = NSBezierPath(ovalIn: NSRect(x: x + s * 0.4, y: y + s * 0.35, width: s * 0.2, height: s * 0.2))
    sand.setFill()
    seal.fill()
    green.setStroke()
    seal.lineWidth = line
    seal.stroke()
    ink.setStroke()
    for wheel in [0.28, 0.72] as [CGFloat] {
        let leg = NSBezierPath()
        leg.move(to: NSPoint(x: x + s * wheel, y: y + s * 0.14))
        leg.line(to: NSPoint(x: x + s * wheel, y: y + s * 0.07))
        leg.lineWidth = line
        leg.lineCapStyle = .round
        leg.stroke()
    }
}

func render(width: Int, height: Int, to path: String, draw: () -> Void) {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: width, height: height)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    draw()
    NSGraphicsContext.restoreGraphicsState()
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

for size in [180, 512] {
    render(width: size, height: size, to: "icon-\(size).png") {
        paper.setFill()
        NSRect(x: 0, y: 0, width: size, height: size).fill()
        drawSuitcase(x: CGFloat(size) * 0.1, y: CGFloat(size) * 0.08, size: CGFloat(size) * 0.8)
    }
}

render(width: 1200, height: 630, to: "og-image.png") {
    paper.setFill()
    NSRect(x: 0, y: 0, width: 1200, height: 630).fill()
    ink.setStroke()
    let frame = NSBezierPath(rect: NSRect(x: 28, y: 28, width: 1144, height: 574))
    frame.lineWidth = 4
    frame.stroke()
    drawSuitcase(x: 80, y: 130, size: 370)
    let bold = NSFont(name: "HiraMaruProN-W4", size: 88) ?? NSFont.boldSystemFont(ofSize: 88)
    let title = NSAttributedString(string: "旅のしおり帖", attributes: [.font: bold, .foregroundColor: ink])
    title.draw(at: NSPoint(x: 490, y: 320))
    let small = NSFont(name: "HiraginoSans-W4", size: 38) ?? NSFont.systemFont(ofSize: 38)
    NSAttributedString(string: "旅の計画と、立て替えの精算を", attributes: [.font: small, .foregroundColor: terra]).draw(at: NSPoint(x: 494, y: 245))
    NSAttributedString(string: "この一冊に。", attributes: [.font: small, .foregroundColor: terra]).draw(at: NSPoint(x: 494, y: 190))
}
