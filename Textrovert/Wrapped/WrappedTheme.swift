#if os(iOS)
import SwiftUI

// Wrapped art direction. Namespaced constants only: nothing here touches the shared Theme.
// Anchors are Emma's cross-app palette; the rainbow is reserved for Wrapped's big moments
// (opener name, reply-gap reveal, finale), never for chrome or ordinary slides.

extension Color {
    init(wrappedHex hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

enum WrappedPalette {
    static let plum = Color(wrappedHex: 0x6843A5)
    static let periwinkle = Color(wrappedHex: 0xDCE5FF)
    static let butter = Color(wrappedHex: 0xFFF0CE)
    static let coral = Color(wrappedHex: 0xF6B3A6)
    static let leaf = Color(wrappedHex: 0xB9D9A6)
    static let ink = Color(wrappedHex: 0x29252D)

    static let rainbowColors: [Color] = [plum, Color(wrappedHex: 0xC8479B), coral, butter, leaf, periwinkle]
    static let rainbow = LinearGradient(colors: rainbowColors, startPoint: .leading, endPoint: .trailing)
    /// For text on the dark Wrapped scenes: starts light so every letter keeps contrast.
    static let rainbowText = LinearGradient(colors: [Color(wrappedHex: 0xF2A6D8), coral, butter, leaf, periwinkle], startPoint: .leading, endPoint: .trailing)
    static let rainbowRing = AngularGradient(colors: rainbowColors + [plum], center: .center)
}

/// Each conversation gets its own world, so two chats never share a mood. Chosen by a stable hash of the conversation id.
struct WrappedWorld {
    let deep: Color
    let mid: Color
    let hot: Color
    let glow: Color
    let name: String

    static let plumWorld = WrappedWorld(deep: Color(wrappedHex: 0x1D1030), mid: WrappedPalette.plum, hot: WrappedPalette.coral, glow: WrappedPalette.butter, name: "plum")
    static let leafWorld = WrappedWorld(deep: Color(wrappedHex: 0x15231A), mid: Color(wrappedHex: 0x3F6B47), hot: WrappedPalette.leaf, glow: WrappedPalette.periwinkle, name: "leaf")
    static let periwinkleWorld = WrappedWorld(deep: Color(wrappedHex: 0x151B3D), mid: Color(wrappedHex: 0x4658B8), hot: WrappedPalette.periwinkle, glow: WrappedPalette.coral, name: "periwinkle")
    static let all = [plumWorld, leafWorld, periwinkleWorld]

    static func forConversation(_ id: String) -> WrappedWorld {
        var hash: UInt32 = 2166136261
        for byte in id.utf8 { hash = (hash ^ UInt32(byte)) &* 16777619 }
        return all[Int(hash % UInt32(all.count))]
    }
}

struct WrappedStoryContext {
    let owner: WrappedParticipant
    let friend: WrappedParticipant
    let service: String
    let range: WrappedDateRange
    let locale: Locale
    let world: WrappedWorld

    func stamp(_ date: Date) -> String { WrappedFormat.string(date, template: "MMMdjmm", timeZone: range.timeZone, locale: locale) }
    func day(_ date: Date) -> String { WrappedFormat.string(date, template: "MMMd", timeZone: range.timeZone, locale: locale) }
    func attribution(_ q: WrappedQuote) -> String { "\(q.speakerID == owner.id ? "You" : friend.firstName) · \(stamp(q.sentAt)) · \(q.service)" }
    func isOwner(_ q: WrappedQuote) -> Bool { q.speakerID == owner.id }
}

struct WrappedSlideEnv {
    let index: Int
    let active: Bool
    let focus: AccessibilityFocusState<Int?>.Binding
}

struct WrappedSlideState: Equatable {
    var guess: String?
    var revealed = 0
}

// MARK: - Motion helpers

private struct WrappedEnter: ViewModifier {
    let active: Bool
    let order: Int
    var distance: CGFloat = 28
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .opacity(active ? 1 : 0)
            .offset(y: active || reduceMotion ? 0 : distance)
            .animation(reduceMotion ? .easeOut(duration: 0.1) : .spring(response: 0.6, dampingFraction: 0.8).delay(Double(order) * 0.09), value: active)
    }
}

extension View {
    func wrappedEnter(_ active: Bool, order: Int = 0, distance: CGFloat = 28) -> some View {
        modifier(WrappedEnter(active: active, order: order, distance: distance))
    }
}

/// Slowly drifting colour fields behind a slide. Static under Reduce Motion.
struct WrappedGlow: View {
    let colors: [Color]
    var active = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 24, paused: reduceMotion || !active)) { timeline in
            let t = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
            Canvas { context, size in
                context.addFilter(.blur(radius: 70))
                for (i, color) in colors.enumerated() {
                    let phase = Double(i) * 2.1
                    let x = size.width * (0.5 + 0.38 * sin(t * 0.21 + phase))
                    let y = size.height * (0.5 + 0.38 * cos(t * 0.17 + phase * 1.3))
                    let r = min(size.width, size.height) * (0.42 + 0.06 * sin(t * 0.3 + phase))
                    context.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)), with: .color(color.opacity(0.55)))
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

struct WrappedCountUp: View, Animatable {
    var value: Double
    var animatableData: Double {
        get { value }
        set { value = newValue }
    }
    var body: some View { Text("\(Int(value.rounded()))") }
}

struct WrappedDiagonalWipe: Shape {
    var progress: Double
    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }
    func path(in rect: CGRect) -> Path {
        let slant = rect.width * 0.07
        let edge = (rect.height + slant) * (1 - progress)
        var p = Path()
        p.move(to: CGPoint(x: 0, y: edge + slant))
        p.addLine(to: CGPoint(x: rect.width, y: edge - slant))
        p.addLine(to: CGPoint(x: rect.width, y: rect.height + slant * 2))
        p.addLine(to: CGPoint(x: 0, y: rect.height + slant * 2))
        p.closeSubpath()
        return p
    }
}

struct WrappedSlantedHalf: Shape {
    let leading: Bool
    func path(in rect: CGRect) -> Path {
        let slant = rect.width * 0.06
        let split = rect.width / 2
        var p = Path()
        if leading {
            p.move(to: .zero)
            p.addLine(to: CGPoint(x: split + slant, y: 0))
            p.addLine(to: CGPoint(x: split - slant, y: rect.height))
            p.addLine(to: CGPoint(x: 0, y: rect.height))
        } else {
            p.move(to: CGPoint(x: split + slant, y: 0))
            p.addLine(to: CGPoint(x: rect.width, y: 0))
            p.addLine(to: CGPoint(x: rect.width, y: rect.height))
            p.addLine(to: CGPoint(x: split - slant, y: rect.height))
        }
        p.closeSubpath()
        return p
    }
}

struct WrappedTicketShape: Shape {
    var stubWidth: CGFloat = 96
    func path(in rect: CGRect) -> Path {
        let r: CGFloat = 22
        let stub = rect.width - stubWidth
        var p = Path()
        p.move(to: CGPoint(x: 0, y: 0))
        p.addLine(to: CGPoint(x: stub - r, y: 0))
        p.addArc(center: CGPoint(x: stub, y: 0), radius: r, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: true)
        p.addLine(to: CGPoint(x: rect.width, y: 0))
        p.addLine(to: CGPoint(x: rect.width, y: rect.height))
        p.addLine(to: CGPoint(x: stub + r, y: rect.height))
        p.addArc(center: CGPoint(x: stub, y: rect.height), radius: r, startAngle: .degrees(0), endAngle: .degrees(180), clockwise: true)
        p.addLine(to: CGPoint(x: 0, y: rect.height))
        p.closeSubpath()
        return p
    }
}

struct WrappedGhostShape: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width, h = rect.height
        var p = Path()
        p.move(to: CGPoint(x: 0, y: h * 0.5))
        p.addCurve(to: CGPoint(x: w, y: h * 0.5), control1: CGPoint(x: 0, y: -h * 0.12), control2: CGPoint(x: w, y: -h * 0.12))
        p.addLine(to: CGPoint(x: w, y: h))
        let teeth = 4
        let step = w / CGFloat(teeth)
        for i in 0..<teeth {
            let x0 = w - CGFloat(i) * step
            p.addQuadCurve(to: CGPoint(x: x0 - step, y: h), control: CGPoint(x: x0 - step / 2, y: h * 0.76))
        }
        p.closeSubpath()
        return p
    }
}

struct WrappedTangentShape: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width, h = rect.height
        var p = Path()
        p.move(to: CGPoint(x: 0, y: h * 0.22))
        p.addLine(to: CGPoint(x: w * 0.44, y: h * 0.22))
        p.addCurve(to: CGPoint(x: w * 0.6, y: h * 0.88), control1: CGPoint(x: w * 0.74, y: h * 0.22), control2: CGPoint(x: w * 0.42, y: h * 0.72))
        p.addCurve(to: CGPoint(x: w * 0.97, y: h * 0.45), control1: CGPoint(x: w * 0.8, y: h * 1.02), control2: CGPoint(x: w * 0.82, y: h * 0.45))
        return p
    }
}

struct WrappedScroll<Content: View>: View {
    var bottom: CGFloat = 124
    @ViewBuilder let content: Content

    var body: some View {
        GeometryReader { geo in
            ScrollView(showsIndicators: false) {
                content
                    .padding(.horizontal, 24)
                    .padding(.top, 88)
                    .padding(.bottom, bottom)
                    .frame(maxWidth: .infinity, minHeight: geo.size.height, alignment: .topLeading)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
    }
}

extension View {
    func wrappedHeading(_ env: WrappedSlideEnv) -> some View {
        accessibilityAddTraits(.isHeader).accessibilityFocused(env.focus, equals: env.index)
    }
}

/// Display type treatments. Each scene picks one so an edition never reads as one repeated font.
enum WrappedType {
    case serifItalic
    case poster
    case wide
    case typewriter
    case rounded

    func font(size: CGFloat) -> Font {
        switch self {
        case .serifItalic: return .system(size: size, weight: .black, design: .serif).italic()
        case .poster: return .system(size: size * 1.08, weight: .black).width(.compressed)
        case .wide: return .system(size: size * 0.82, weight: .heavy).width(.expanded)
        case .typewriter: return .system(size: size * 0.66, weight: .bold, design: .monospaced)
        case .rounded: return .system(size: size * 0.92, weight: .heavy, design: .rounded)
        }
    }

    var uppercased: Bool { self == .poster }
    var tracking: CGFloat {
        switch self {
        case .poster: return 0.5
        case .wide: return -0.5
        case .typewriter: return -0.4
        default: return -0.8
        }
    }
}

struct WrappedDisplayText: View {
    let text: String
    var type: WrappedType = .serifItalic
    @ScaledMetric(relativeTo: .largeTitle) private var base: CGFloat = 54

    private var size: CGFloat {
        switch text.count {
        case ...22: return base * 1.2
        case ...44: return base * 0.86
        case ...80: return base * 0.64
        default: return base * 0.5
        }
    }

    var body: some View {
        Text(type.uppercased ? text.uppercased() : text)
            .font(type.font(size: size))
            .tracking(type.tracking)
            .lineSpacing(type == .typewriter ? 4 : -size * 0.08)
            .fixedSize(horizontal: false, vertical: true)
            .multilineTextAlignment(.leading)
            .accessibilityLabel(text)
    }
}

/// One verified message, set as a chat bubble with its source line directly beneath it.
struct WrappedBubble: View {
    let quote: WrappedQuote
    let context: WrappedStoryContext
    let fill: Color
    let text: Color
    let caption: Color

    var body: some View {
        let mine = context.isOwner(quote)
        VStack(alignment: mine ? .trailing : .leading, spacing: 6) {
            Text(quote.text)
                .font(.system(.title3, design: .rounded).weight(.semibold))
                .foregroundStyle(text)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(fill, in: UnevenRoundedRectangle(topLeadingRadius: 22, bottomLeadingRadius: mine ? 22 : 6, bottomTrailingRadius: mine ? 6 : 22, topTrailingRadius: 22))
            Text(context.attribution(quote))
                .font(.caption.weight(.medium))
                .foregroundStyle(caption)
        }
        .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(mine ? "You" : context.friend.firstName) said, \(quote.text). \(context.attribution(quote))")
    }
}
#endif
