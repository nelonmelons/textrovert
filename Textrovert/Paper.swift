import SwiftUI
import UIKit

extension Theme {
    static let paper = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.129, green: 0.114, blue: 0.133, alpha: 1)
            : UIColor(red: 0.961, green: 0.941, blue: 0.902, alpha: 1)
    })
    static let panel = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.18, green: 0.16, blue: 0.18, alpha: 1)
            : UIColor(red: 1.0, green: 0.992, blue: 0.976, alpha: 1)
    })
    static let gridLine = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 1.0, green: 0.92, blue: 0.85, alpha: 0.05)
            : UIColor(red: 0.45, green: 0.36, blue: 0.30, alpha: 0.08)
    })
    static let gridMajor = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 1.0, green: 0.92, blue: 0.85, alpha: 0.08)
            : UIColor(red: 0.45, green: 0.36, blue: 0.30, alpha: 0.13)
    })
}

struct GridPaper: View {
    static let cell: CGFloat = 22
    static let period = cell * 4
    static let drift: CGFloat = 0.4
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let still = reduceMotion
        Canvas { context, size in
            var minor = Path()
            var major = Path()
            var x: CGFloat = 0
            var column = 0
            while x <= size.width {
                let line = Path { $0.move(to: CGPoint(x: x, y: 0)); $0.addLine(to: CGPoint(x: x, y: size.height)) }
                if column.isMultiple(of: 4) { major.addPath(line) } else { minor.addPath(line) }
                x += Self.cell
                column += 1
            }
            var y: CGFloat = 0
            var row = 0
            while y <= size.height {
                let line = Path { $0.move(to: CGPoint(x: 0, y: y)); $0.addLine(to: CGPoint(x: size.width, y: y)) }
                if row.isMultiple(of: 4) { major.addPath(line) } else { minor.addPath(line) }
                y += Self.cell
                row += 1
            }
            context.stroke(minor, with: .color(Theme.gridLine), lineWidth: 0.5)
            context.stroke(major, with: .color(Theme.gridMajor), lineWidth: 0.75)
        }
        .padding(.top, -480)
        .padding(.bottom, -1400)
        .visualEffect { content, proxy in
            let raw = -proxy.frame(in: .scrollView).minY * (still ? 1 : Self.drift)
            return content.offset(y: raw - (raw / Self.period).rounded(.down) * Self.period)
        }
        .accessibilityHidden(true)
        .allowsHitTesting(false)
    }
}

extension View {
    func gridPaper() -> some View {
        background(alignment: .top) { GridPaper() }
    }

    func paperScroll() -> some View {
        background(Theme.paper.ignoresSafeArea())
            .overlay(alignment: .top) {
                Color.clear
                    .frame(height: 0)
                    .background(Theme.paper.ignoresSafeArea(edges: .top))
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
    }

    func paperNavigationBar() -> some View {
        toolbarBackground(Theme.paper, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
    }
}

struct SourceHeader: View {
    let friend: Friend
    var body: some View {
        HStack(spacing: 14) {
            Face(initials: friend.initials)
            VStack(alignment: .leading, spacing: 2) {
                Text(friend.name).font(.system(.title3, design: .rounded, weight: .bold))
                Text(friend.handle).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

struct Bubble: View {
    let text: String
    let meta: String
    var service: String? = nil
    var fromMe = false
    var cited = false

    var body: some View {
        VStack(alignment: fromMe ? .trailing : .leading, spacing: 6) {
            Text(text)
                .foregroundStyle(fromMe ? Color.white : Color.primary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background {
                    if fromMe {
                        UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: 18, bottomTrailingRadius: 4, topTrailingRadius: 18)
                            .fill(Theme.accent)
                    } else {
                        UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: 4, bottomTrailingRadius: 18, topTrailingRadius: 18)
                            .fill(Color(uiColor: .systemBackground))
                    }
                }
                .overlay {
                    if cited {
                        UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: fromMe ? 18 : 4, bottomTrailingRadius: fromMe ? 4 : 18, topTrailingRadius: 18)
                            .strokeBorder(Theme.accent, lineWidth: 2)
                    }
                }
                .shadow(color: .black.opacity(0.06), radius: 3, y: 1)
            HStack(spacing: 6) {
                if cited {
                    Label("Used in the reading", systemImage: "quote.opening")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.accent)
                    Text("·").font(.caption).foregroundStyle(.secondary)
                }
                if let service { ServiceIcon(service: service) }
                Text(meta).font(.caption).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: fromMe ? .trailing : .leading)
        .padding(fromMe ? .leading : .trailing, 40)
        .accessibilityElement(children: .combine)
    }
}

struct ServiceIcon: View {
    let service: String
    var body: some View {
        Image(systemName: serviceSymbol(service))
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .accessibilityLabel("From \(service)")
    }
}

struct RowChevron: View {
    var body: some View {
        Image(systemName: "chevron.right")
            .font(.caption.weight(.bold))
            .foregroundStyle(.secondary)
            .accessibilityHidden(true)
    }
}

struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Theme.accentTone.fill.opacity(0.6) : Color.clear, in: RoundedRectangle(cornerRadius: 12))
            .opacity(configuration.isPressed ? 0.75 : 1)
    }
}

struct HedgehogAvatar: View {
    var body: some View {
        Art.image("hedgehog-mark")
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .foregroundStyle(Theme.accent)
            .padding(6)
            .frame(width: 34, height: 34)
            .background(Theme.accentTone.fill, in: Circle())
            .accessibilityHidden(true)
    }
}

enum Art {
    static func image(_ name: String) -> Image {
        Image(uiImage: UIImage(named: name) ?? UIImage())
    }
}

func serviceSymbol(_ service: String) -> String {
    service == "Instagram" ? "camera" : service == "WhatsApp" ? "phone.bubble" : "message"
}
