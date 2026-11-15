#if os(iOS)
import SwiftUI

// Hand-built story slides. Each finding gets its own composition, colour world and motion.

struct WrappedEyebrow: View {
    let text: String
    let color: Color
    var body: some View {
        Text(text.uppercased())
            .font(.system(.caption, design: .rounded).weight(.heavy))
            .tracking(2.6)
            .foregroundStyle(color)
    }
}

private struct WrappedTapPill: View {
    let title: String
    let color: Color
    let ink: Color
    let identifier: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Text(title).font(.system(.headline, design: .rounded).weight(.heavy))
                Image(systemName: "hand.tap.fill").imageScale(.medium)
            }
            .foregroundStyle(ink)
            .padding(.horizontal, 22)
            .padding(.vertical, 15)
            .background(color, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier)
    }
}

// MARK: - Opener

struct WrappedOpenerScene: View {
    let context: WrappedStoryContext
    let messageCount: Int
    let editionNumber: Int
    let isShortRecap: Bool
    let env: WrappedSlideEnv
    @State private var spin = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let w = context.world
        ZStack {
            LinearGradient(colors: [w.deep, w.mid.opacity(0.8), w.deep], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
            WrappedGlow(colors: [w.mid, w.hot.opacity(0.7), w.glow.opacity(0.4)], active: env.active)
            Color.clear
                .overlay(alignment: .bottomTrailing) {
                    Circle()
                        .strokeBorder(WrappedPalette.rainbowRing, lineWidth: 26)
                        .frame(width: 520, height: 520)
                        .rotationEffect(.degrees(spin ? 360 : 0))
                        .offset(x: 170, y: 250)
                        .opacity(0.9)
                }
                .clipped()
                .ignoresSafeArea()
                .accessibilityHidden(true)
            WrappedScroll {
                VStack(alignment: .leading, spacing: 18) {
                    WrappedEyebrow(text: editionNumber > 1 ? "Wrapped · edition \(editionNumber)" : "Wrapped", color: w.glow)
                        .wrappedEnter(env.active, order: 0)
                    VStack(alignment: .leading, spacing: -2) {
                        Text("YOU &")
                            .font(.system(size: 44, weight: .heavy).width(.expanded))
                            .foregroundStyle(WrappedPalette.butter)
                        Text(context.friend.firstName)
                            .font(.system(size: 92, weight: .black, design: .serif).italic())
                            .foregroundStyle(WrappedPalette.rainbowText)
                    }
                    .minimumScaleFactor(0.5)
                    .wrappedEnter(env.active, order: 1, distance: 44)
                    .wrappedHeading(env)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Wrapped, you and \(context.friend.firstName)")
                    .accessibilityAddTraits(.isHeader)
                    Text(context.range.label(locale: context.locale))
                        .font(.system(.title2, design: .rounded).weight(.bold))
                        .foregroundStyle(w.glow)
                        .wrappedEnter(env.active, order: 2)
                    Text(isShortRecap
                         ? "I only found \(messageCount) messages in this range, so this one’s short."
                         : "I read \(messageCount) of your \(context.service) messages with \(context.friend.firstName). I only kept moments I could trace back to the original texts.")
                        .font(.body.weight(.medium))
                        .foregroundStyle(WrappedPalette.butter.opacity(0.9))
                        .fixedSize(horizontal: false, vertical: true)
                        .wrappedEnter(env.active, order: 3)
                    HStack(spacing: 8) {
                        Text("Swipe or tap Next")
                        Image(systemName: "arrow.right")
                    }
                    .font(.system(.subheadline, design: .rounded).weight(.heavy))
                    .foregroundStyle(w.hot)
                    .padding(.top, 8)
                    .wrappedEnter(env.active, order: 4)
                }
            }
        }
        .onAppear { startSpin() }
    }

    private func startSpin() {
        guard !reduceMotion else { return }
        withAnimation(.linear(duration: 60).repeatForever(autoreverses: false)) { spin = true }
    }
}

// MARK: - Who said it

struct WrappedGuessScene: View {
    let highlight: WrappedHighlight
    let context: WrappedStoryContext
    let env: WrappedSlideEnv
    let state: WrappedSlideState
    let onGuess: (String) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let w = context.world
        let setup = highlight.quotes(.setup)[0]
        let answer = highlight.quotes(.reveal)[0]
        let guessed = state.guess != nil
        let speakerColor = context.isOwner(setup) ? w.hot : w.glow
        let seconds: TimeInterval = { if case .answeredIn(let s) = highlight.figure { return s } else { return 0 } }()

        ZStack {
            w.deep.ignoresSafeArea()
            RadialGradient(colors: [w.glow.opacity(0.4), .clear], center: .top, startRadius: 0, endRadius: 560).ignoresSafeArea()
            WrappedGlow(colors: [w.mid, w.hot.opacity(0.45)], active: env.active && !guessed)
            Text("“")
                .font(.system(size: 420, weight: .black, design: .serif))
                .foregroundStyle(w.hot.opacity(0.22))
                .offset(x: -36, y: -120)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .accessibilityHidden(true)

            WrappedScroll(bottom: guessed ? 124 : 300) {
                VStack(alignment: .leading, spacing: 22) {
                    WrappedEyebrow(text: highlight.headline, color: w.hot).wrappedEnter(env.active, order: 0)
                    WrappedDisplayText(text: "“\(setup.text)”")
                        .foregroundStyle(WrappedPalette.butter)
                        .wrappedEnter(env.active, order: 1, distance: 40)
                        .wrappedHeading(env)
                }
            }

            if !guessed {
                VStack(alignment: .leading, spacing: 14) {
                    Spacer()
                    Text(highlight.prompt)
                        .font(.system(.title3, design: .rounded).weight(.bold))
                        .foregroundStyle(w.glow)
                        .padding(.horizontal, 24)
                        .wrappedEnter(env.active, order: 2)
                    ZStack {
                        splitButton(name: context.owner.firstName, id: context.owner.id, leading: true, fill: w.hot)
                        splitButton(name: context.friend.firstName, id: context.friend.id, leading: false, fill: w.glow)
                    }
                    .frame(height: 170)
                    .padding(.bottom, 96)
                    .wrappedEnter(env.active, order: 3, distance: 60)
                }
                .ignoresSafeArea(edges: .horizontal)
            }

            ZStack(alignment: .topLeading) {
                speakerColor.ignoresSafeArea()
                WrappedScroll {
                    VStack(alignment: .leading, spacing: 18) {
                        WrappedEyebrow(text: state.guess == setup.speakerID ? "You called it" : "It was", color: WrappedPalette.ink.opacity(0.75))
                            .wrappedEnter(guessed, order: 1)
                        Text((context.isOwner(setup) ? "You" : context.friend.firstName).uppercased())
                            .font(.system(size: 120, weight: .black).width(.compressed))
                            .minimumScaleFactor(0.5)
                            .foregroundStyle(WrappedPalette.ink)
                            .wrappedEnter(guessed, order: 2, distance: 50)
                        Text("“\(setup.text)”")
                            .font(.system(.title3, design: .serif).weight(.semibold).italic())
                            .foregroundStyle(WrappedPalette.ink)
                            .wrappedEnter(guessed, order: 3)
                        Text(context.attribution(setup))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(WrappedPalette.ink.opacity(0.75))
                            .wrappedEnter(guessed, order: 3)
                        Rectangle().fill(WrappedPalette.ink.opacity(0.25)).frame(height: 2).padding(.vertical, 6)
                        WrappedEyebrow(text: "\(context.isOwner(answer) ? "You" : context.friend.firstName), \(WrappedFormat.elapsed(seconds)) later", color: WrappedPalette.ink.opacity(0.75))
                            .wrappedEnter(guessed, order: 5)
                        WrappedBubble(quote: answer, context: context, fill: WrappedPalette.ink, text: WrappedPalette.butter, caption: WrappedPalette.ink.opacity(0.75))
                            .wrappedEnter(guessed, order: 6, distance: 34)
                    }
                }
            }
            .mask(alignment: .bottom) {
                Rectangle().ignoresSafeArea().scaleEffect(y: guessed || reduceMotion ? 1 : 0, anchor: .bottom)
            }
            .opacity(guessed ? 1 : 0)
            .animation(reduceMotion ? .easeOut(duration: 0.1) : .easeInOut(duration: 0.55), value: guessed)
            .allowsHitTesting(guessed)
            .accessibilityHidden(!guessed)
        }
    }

    private func splitButton(name: String, id: String, leading: Bool, fill: Color) -> some View {
        let shape = WrappedSlantedHalf(leading: leading)
        return Button { onGuess(id) } label: {
            ZStack(alignment: leading ? .leading : .trailing) {
                shape.fill(fill)
                Text(name.uppercased())
                    .font(.system(size: 46, weight: .black).width(.compressed))
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                    .foregroundStyle(WrappedPalette.ink)
                    .padding(.horizontal, 28)
            }
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Guess \(name)")
        .accessibilityIdentifier("wrappedGuess-\(id)")
    }
}

// MARK: - Running joke: the timeline of callbacks

struct WrappedTimelineFigure: View, Animatable {
    let dates: [Date]
    let range: WrappedDateRange
    let color: Color
    let track: Color
    var progress: Double
    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    var body: some View {
        Canvas { context, size in
            let y = size.height * 0.68
            let inset: CGFloat = 16
            let span = range.end.timeIntervalSince(range.start)
            var axis = Path()
            axis.move(to: CGPoint(x: inset, y: y))
            axis.addLine(to: CGPoint(x: inset + (size.width - inset * 2) * min(progress * 2, 1), y: y))
            context.stroke(axis, with: .color(track), style: StrokeStyle(lineWidth: 3, lineCap: .round))
            for d in 0...max(range.dayCount, 1) {
                let x = inset + (size.width - inset * 2) * CGFloat(d) / CGFloat(max(range.dayCount, 1))
                var tick = Path()
                tick.move(to: CGPoint(x: x, y: y - 5))
                tick.addLine(to: CGPoint(x: x, y: y + 5))
                context.stroke(tick, with: .color(track.opacity(x <= inset + (size.width - inset * 2) * min(progress * 2, 1) ? 1 : 0)), lineWidth: 1.5)
            }
            for (i, date) in dates.enumerated() {
                let appear = min(max(progress * Double(dates.count + 1) - Double(i) - 0.6, 0), 1)
                guard appear > 0 else { continue }
                let x = inset + (size.width - inset * 2) * CGFloat(date.timeIntervalSince(range.start) / span)
                let r = 11 * CGFloat(appear)
                var stem = Path()
                stem.move(to: CGPoint(x: x, y: y))
                stem.addLine(to: CGPoint(x: x, y: y - 34 * CGFloat(appear)))
                context.stroke(stem, with: .color(color), lineWidth: 2)
                context.fill(Path(ellipseIn: CGRect(x: x - r * 1.9, y: y - 34 * appear - r * 1.9, width: r * 3.8, height: r * 3.8)), with: .color(color.opacity(0.22)))
                context.fill(Path(ellipseIn: CGRect(x: x - r, y: y - 34 * appear - r, width: r * 2, height: r * 2)), with: .color(color))
            }
        }
    }
}

struct WrappedJokeScene: View {
    let highlight: WrappedHighlight
    let context: WrappedStoryContext
    let env: WrappedSlideEnv
    let state: WrappedSlideState
    let onReveal: () -> Void
    @State private var progress = 0.0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let w = context.world
        let first = highlight.quotes(.setup)[0]
        let last = highlight.quotes(.punchline)[0]
        let dates: [Date] = { if case .occurrences(let d) = highlight.figure { return d } else { return [] } }()
        let days = Calendar.current.dateComponents([.day], from: first.sentAt, to: last.sentAt).day ?? 0
        ZStack {
            LinearGradient(colors: [w.mid, w.deep], startPoint: .topTrailing, endPoint: .bottomLeading).ignoresSafeArea()
            WrappedGlow(colors: [w.hot.opacity(0.7), w.glow.opacity(0.4)], active: env.active)
            Text("\(highlight.quantity?.value ?? "")×")
                .font(.system(size: 300, weight: .black).width(.compressed))
                .foregroundStyle(w.hot.opacity(0.12))
                .minimumScaleFactor(0.4)
                .offset(x: 30, y: 40)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .accessibilityHidden(true)
            WrappedScroll {
                VStack(alignment: .leading, spacing: 20) {
                    WrappedEyebrow(text: "Running joke", color: w.hot).wrappedEnter(env.active, order: 0)
                    WrappedDisplayText(text: highlight.headline, type: .poster)
                        .foregroundStyle(WrappedPalette.butter)
                        .wrappedEnter(env.active, order: 1, distance: 40)
                        .wrappedHeading(env)
                    VStack(alignment: .leading, spacing: 4) {
                        WrappedTimelineFigure(dates: dates, range: context.range, color: w.hot, track: w.glow.opacity(0.55), progress: progress)
                            .frame(height: 112)
                        HStack {
                            Text(context.day(context.range.start))
                            Spacer()
                            Text(context.day(context.range.end.addingTimeInterval(-1)))
                        }
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(w.glow.opacity(0.8))
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Timeline: \(highlight.quantity?.value ?? "") uses, \(highlight.quantity?.detail ?? "")")
                    .wrappedEnter(env.active, order: 2)
                    WrappedEyebrow(text: "First time", color: w.glow).wrappedEnter(env.active, order: 3)
                    WrappedBubble(quote: first, context: context, fill: w.glow, text: WrappedPalette.ink, caption: w.glow.opacity(0.85))
                        .wrappedEnter(env.active, order: 3, distance: 34)
                    if state.revealed == 0 {
                        HStack {
                            WrappedTapPill(title: "Show the latest callback", color: w.hot, ink: WrappedPalette.ink, identifier: "wrappedReveal", action: onReveal)
                        }
                        .wrappedEnter(env.active, order: 4)
                    } else {
                        WrappedEyebrow(text: "Latest · \(days) days later", color: w.hot)
                        WrappedBubble(quote: last, context: context, fill: w.hot, text: WrappedPalette.ink, caption: w.glow.opacity(0.85))
                            .transition(reduceMotion ? .opacity : .scale(scale: 0.85, anchor: .bottomTrailing).combined(with: .opacity))
                    }
                    if !highlight.why.isEmpty {
                        Text(highlight.why)
                            .font(.footnote)
                            .foregroundStyle(w.glow.opacity(0.9))
                            .fixedSize(horizontal: false, vertical: true)
                            .wrappedEnter(env.active, order: 5)
                    }
                }
            }
        }
        .onChange(of: env.active) { _, active in animate(active) }
        .onAppear { if env.active { animate(true) } }
    }

    private func animate(_ active: Bool) {
        if reduceMotion { progress = active ? 1 : 0; return }
        withAnimation(active ? .easeOut(duration: 1.4).delay(0.35) : nil) { progress = active ? 1 : 0 }
    }
}

// MARK: - Invitation: ticket and stamp

struct WrappedTicketScene: View {
    let highlight: WrappedHighlight
    let context: WrappedStoryContext
    let env: WrappedSlideEnv
    let state: WrappedSlideState
    let onReveal: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let w = context.world
        let invite = highlight.quotes(.setup)[0]
        let reply = highlight.quotes(.punchline)[0]
        let seconds: TimeInterval = { if case .answeredIn(let s) = highlight.figure { return s } else { return 0 } }()
        let answered = state.revealed > 0
        ZStack {
            w.glow.ignoresSafeArea()
            WrappedGlow(colors: [w.hot.opacity(0.8), w.mid.opacity(0.25)], active: env.active)
            WrappedScroll {
                VStack(alignment: .leading, spacing: 22) {
                    WrappedEyebrow(text: "A plan, on the record", color: WrappedPalette.ink.opacity(0.7)).wrappedEnter(env.active, order: 0)
                    HStack(spacing: 0) {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("\(context.isOwner(invite) ? "You" : context.friend.firstName) asked")
                                .font(.system(.subheadline, design: .rounded).weight(.heavy))
                                .tracking(1.2)
                                .foregroundStyle(w.hot)
                            WrappedDisplayText(text: "“\(invite.text)”", type: .wide)
                                .foregroundStyle(WrappedPalette.butter)
                                .wrappedHeading(env)
                            Text(context.attribution(invite))
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(WrappedPalette.butter.opacity(0.85))
                        }
                        .padding(22)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        VStack(spacing: 4) {
                            Text(context.day(invite.sentAt).uppercased())
                                .font(.system(.title3, design: .rounded).weight(.black))
                                .multilineTextAlignment(.center)
                            Image(systemName: "calendar")
                        }
                        .foregroundStyle(WrappedPalette.butter)
                        .frame(width: 96)
                        .accessibilityHidden(true)
                    }
                    .background(WrappedTicketShape(stubWidth: 96).fill(w.mid))
                    .overlay(alignment: .trailing) {
                        Rectangle()
                            .stroke(WrappedPalette.butter.opacity(0.7), style: StrokeStyle(lineWidth: 2, dash: [5, 6]))
                            .frame(width: 2)
                            .padding(.vertical, 26)
                            .padding(.trailing, 95)
                    }
                    .rotationEffect(.degrees(reduceMotion ? 0 : -2.5))
                    .wrappedEnter(env.active, order: 1, distance: 50)

                    if !answered {
                        WrappedTapPill(title: "See the answer", color: w.mid, ink: WrappedPalette.butter, identifier: "wrappedReveal", action: onReveal)
                            .wrappedEnter(env.active, order: 3)
                    } else {
                        VStack(alignment: .trailing, spacing: 6) {
                            ZStack {
                                Circle().strokeBorder(w.mid, lineWidth: 4)
                                Text("ANSWERED IN\n\(WrappedFormat.elapsed(seconds).uppercased())")
                                    .font(.system(size: 11, weight: .black, design: .rounded))
                                    .tracking(0.8)
                                    .multilineTextAlignment(.center)
                                    .foregroundStyle(w.mid)
                                    .padding(10)
                            }
                            .frame(width: 96, height: 96)
                            .background(Circle().fill(w.glow))
                            .rotationEffect(.degrees(-12))
                            .transition(reduceMotion ? .opacity : .scale(scale: 2.2).combined(with: .opacity))
                            .accessibilityHidden(true)
                            WrappedBubble(quote: reply, context: context, fill: WrappedPalette.ink, text: WrappedPalette.butter, caption: WrappedPalette.ink.opacity(0.75))
                        }
                        .transition(.opacity)
                    }
                    if !highlight.why.isEmpty {
                        Text(highlight.why)
                            .font(.footnote)
                            .foregroundStyle(WrappedPalette.ink.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                            .wrappedEnter(env.active, order: 4)
                    }
                }
            }
        }
    }
}

// MARK: - Twist: the last line wipes over the first

struct WrappedTwistScene: View {
    let highlight: WrappedHighlight
    let context: WrappedStoryContext
    let env: WrappedSlideEnv
    let state: WrappedSlideState
    let onReveal: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let w = context.world
        let setup = highlight.quotes(.setup)[0]
        let punch = highlight.quotes(.punchline)
        let revealed = state.revealed > 0
        ZStack {
            LinearGradient(colors: [w.mid, w.deep], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
            WrappedGlow(colors: [w.glow.opacity(0.35), w.hot.opacity(0.35)], active: env.active && !revealed)
            WrappedScroll(bottom: 120) {
                VStack(alignment: .leading, spacing: 22) {
                    WrappedEyebrow(text: highlight.headline, color: w.hot).wrappedEnter(env.active, order: 0)
                    WrappedDisplayText(text: "“\(setup.text)”", type: .typewriter)
                        .foregroundStyle(WrappedPalette.butter)
                        .wrappedEnter(env.active, order: 1, distance: 40)
                        .wrappedHeading(env)
                    Text(context.attribution(setup))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(w.glow.opacity(0.9))
                        .wrappedEnter(env.active, order: 2)
                    VStack(alignment: .leading, spacing: 16) {
                        if !revealed {
                            WrappedTapPill(title: "See how it ends", color: w.hot, ink: WrappedPalette.ink, identifier: "wrappedReveal", action: onReveal)
                        } else {
                            ForEach(Array(punch.enumerated()).filter { $0.offset < state.revealed }, id: \.offset) { i, q in
                                if i == punch.count - 1 {
                                    VStack(alignment: .leading, spacing: 8) {
                                        WrappedDisplayText(text: "“\(q.text)”")
                                            .foregroundStyle(WrappedPalette.ink)
                                        Text(context.attribution(q))
                                            .font(.caption.weight(.semibold))
                                            .foregroundStyle(WrappedPalette.ink.opacity(0.75))
                                    }
                                } else {
                                    WrappedBubble(quote: q, context: context, fill: WrappedPalette.ink, text: WrappedPalette.butter, caption: WrappedPalette.ink.opacity(0.75))
                                }
                            }
                        }
                        if !highlight.why.isEmpty {
                            Text(highlight.why)
                                .font(.footnote.weight(.medium))
                                .foregroundStyle(revealed ? WrappedPalette.ink.opacity(0.85) : w.glow.opacity(0.9))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(.top, 70)
                    .padding(.bottom, 28)
                    .frame(maxWidth: .infinity, minHeight: 300, alignment: .topLeading)
                    .background(alignment: .bottom) {
                        WrappedDiagonalWipe(progress: revealed ? 1 : 0)
                            .fill(w.hot)
                            .padding(.horizontal, -24)
                            .animation(reduceMotion ? .easeOut(duration: 0.1) : .easeInOut(duration: 0.55), value: revealed)
                    }
                    Color.clear.frame(height: 36)
                }
            }
        }
    }
}

// MARK: - Pivot: a line that veers off

struct WrappedPivotScene: View {
    let highlight: WrappedHighlight
    let context: WrappedStoryContext
    let env: WrappedSlideEnv
    let state: WrappedSlideState
    let onReveal: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let w = context.world
        let setup = highlight.quotes(.setup)[0]
        let swerve = highlight.quotes(.punchline)[0]
        let revealed = state.revealed > 0
        let seconds: TimeInterval = { if case .answeredIn(let s) = highlight.figure { return s } else { return 0 } }()
        ZStack {
            w.deep.ignoresSafeArea()
            WrappedGlow(colors: [w.mid, w.hot.opacity(0.35)], active: env.active)
            WrappedScroll {
                VStack(alignment: .leading, spacing: 20) {
                    WrappedEyebrow(text: highlight.headline, color: w.hot).wrappedEnter(env.active, order: 0)
                    WrappedBubble(quote: setup, context: context, fill: w.glow, text: WrappedPalette.ink, caption: w.glow.opacity(0.85))
                        .wrappedEnter(env.active, order: 1, distance: 34)
                        .wrappedHeading(env)
                    WrappedTangentShape()
                        .trim(from: 0, to: revealed ? 1 : 0.3)
                        .stroke(w.hot, style: StrokeStyle(lineWidth: 7, lineCap: .round, lineJoin: .round))
                        .frame(height: 150)
                        .animation(reduceMotion ? .easeOut(duration: 0.1) : .easeInOut(duration: 1.0), value: revealed)
                        .accessibilityHidden(true)
                        .wrappedEnter(env.active, order: 2)
                    if !revealed {
                        WrappedTapPill(title: "What came next?", color: w.hot, ink: WrappedPalette.ink, identifier: "wrappedReveal", action: onReveal)
                            .wrappedEnter(env.active, order: 3)
                    } else {
                        WrappedEyebrow(text: "\(WrappedFormat.elapsed(seconds)) later", color: w.glow)
                        WrappedDisplayText(text: "“\(swerve.text)”", type: .rounded)
                            .foregroundStyle(WrappedPalette.butter)
                            .rotationEffect(.degrees(reduceMotion ? 0 : 2), anchor: .leading)
                            .transition(reduceMotion ? .opacity : .move(edge: .trailing).combined(with: .opacity))
                        Text(context.attribution(swerve))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(w.glow.opacity(0.9))
                    }
                    if !highlight.why.isEmpty {
                        Text(highlight.why)
                            .font(.footnote)
                            .foregroundStyle(w.glow.opacity(0.9))
                            .fixedSize(horizontal: false, vertical: true)
                            .wrappedEnter(env.active, order: 4)
                    }
                }
            }
        }
    }
}

// MARK: - Reply gaps: your private ghost era

struct WrappedGhostScene: View {
    let highlight: WrappedHighlight
    let context: WrappedStoryContext
    let env: WrappedSlideEnv
    let state: WrappedSlideState
    let onReveal: () -> Void
    @State private var bob = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let w = context.world
        let revealed = state.revealed > 0
        let gaps: [TimeInterval] = { if case .gaps(let g) = highlight.figure { return g.sorted(by: >) } else { return [] } }()
        let longest = max(gaps.first ?? 1, 1)
        ZStack {
            LinearGradient(colors: [w.deep, w.mid.opacity(0.85), w.deep], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
            WrappedStars(color: w.glow, active: env.active)
            WrappedScroll {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 10) {
                            WrappedEyebrow(text: "Your reply habits", color: w.hot).wrappedEnter(env.active, order: 0)
                            WrappedDisplayText(text: highlight.headline, type: .wide)
                                .foregroundStyle(WrappedPalette.butter)
                                .wrappedEnter(env.active, order: 1, distance: 40)
                                .wrappedHeading(env)
                        }
                        Spacer(minLength: 8)
                        ZStack {
                            WrappedGhostShape().fill(w.glow)
                            HStack(spacing: 12) {
                                Capsule().fill(w.deep).frame(width: 7, height: 12)
                                Capsule().fill(w.deep).frame(width: 7, height: 12)
                            }
                            .offset(y: -4)
                        }
                        .frame(width: 70, height: 82)
                        .offset(y: reduceMotion ? 0 : (bob ? -8 : 8))
                        .accessibilityHidden(true)
                    }
                    Label("Private unless you choose to share it.", systemImage: "lock.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(w.glow)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .overlay(Capsule().strokeBorder(w.glow.opacity(0.7), lineWidth: 1.5))
                        .wrappedEnter(env.active, order: 2)
                    Text(highlight.prompt)
                        .font(.system(.title3, design: .rounded).weight(.bold))
                        .foregroundStyle(w.glow)
                        .fixedSize(horizontal: false, vertical: true)
                        .wrappedEnter(env.active, order: 3)
                    if !revealed {
                        WrappedTapPill(title: "Reveal the receipts", color: w.hot, ink: WrappedPalette.ink, identifier: "wrappedReveal", action: onReveal)
                            .wrappedEnter(env.active, order: 4)
                    } else {
                        let n = gaps.count
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            WrappedCountUp(value: revealed ? Double(n) : 0)
                                .animation(reduceMotion ? nil : .easeOut(duration: 1.2), value: revealed)
                                .font(.system(size: 112, weight: .black, design: .rounded))
                                .foregroundStyle(WrappedPalette.rainbowText)
                                .minimumScaleFactor(0.5)
                                .accessibilityLabel("\(n)")
                            Text(highlight.quantity?.label ?? "")
                                .font(.system(.title2, design: .rounded).weight(.heavy))
                                .foregroundStyle(WrappedPalette.butter)
                        }
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(Array(gaps.enumerated()), id: \.offset) { i, g in
                                WrappedGapBar(seconds: g, fraction: g / longest, color: i == 0 ? w.hot : w.glow, delay: Double(i) * 0.15)
                            }
                        }
                        if !highlight.why.isEmpty {
                            Text(highlight.why)
                                .font(.footnote)
                                .foregroundStyle(w.glow.opacity(0.9))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 2.2).repeatForever(autoreverses: true)) { bob = true }
        }
    }
}

struct WrappedGapBar: View {
    let seconds: TimeInterval
    let fraction: Double
    let color: Color
    let delay: Double
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 10) {
            GeometryReader { geo in
                Capsule().fill(color)
                    .frame(width: max(14, geo.size.width * CGFloat(fraction)) * (shown ? 1 : 0.02), alignment: .leading)
            }
            .frame(height: 16)
            Text(WrappedFormat.elapsed(seconds))
                .font(.caption.weight(.bold))
                .foregroundStyle(WrappedPalette.butter)
                .fixedSize()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Gap of \(WrappedFormat.elapsed(seconds))")
        .onAppear {
            if reduceMotion { shown = true; return }
            withAnimation(.easeOut(duration: 0.9).delay(delay + 0.2)) { shown = true }
        }
    }
}

struct WrappedStars: View {
    let color: Color
    var active: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 20, paused: reduceMotion || !active)) { timeline in
            let t = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
            Canvas { context, size in
                for i in 0..<46 {
                    let a = Double((i * 7919) % 1000) / 1000, b = Double((i * 104729) % 1000) / 1000
                    let twinkle = 0.35 + 0.65 * (0.5 + 0.5 * sin(t * 1.4 + Double(i)))
                    let r = 1.2 + 2.2 * Double((i * 31) % 5) / 5
                    context.fill(Path(ellipseIn: CGRect(x: a * size.width, y: b * size.height, width: r, height: r)), with: .color(color.opacity(twinkle * 0.8)))
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

// MARK: - Busiest day

struct WrappedBusiestScene: View {
    let highlight: WrappedHighlight
    let context: WrappedStoryContext
    let env: WrappedSlideEnv
    let state: WrappedSlideState
    let onReveal: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let w = context.world
        let revealed = state.revealed > 0
        let counts: [Int] = { if case .dailyCounts(let c, _, _) = highlight.figure { return c } else { return [] } }()
        let peak: Int = { if case .dailyCounts(_, let p, _) = highlight.figure { return p } else { return 0 } }()
        let most = Double(max(counts.max() ?? 1, 1))
        let first = highlight.quotes(.context).first
        let last = highlight.quotes(.context).last
        ZStack {
            LinearGradient(colors: [w.deep, w.mid], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
            WrappedGlow(colors: [w.hot.opacity(0.5), w.glow.opacity(0.3)], active: env.active)
            WrappedScroll {
                VStack(alignment: .leading, spacing: 20) {
                    WrappedEyebrow(text: "By the numbers", color: w.hot).wrappedEnter(env.active, order: 0)
                    WrappedDisplayText(text: highlight.headline, type: .poster)
                        .foregroundStyle(WrappedPalette.butter)
                        .wrappedEnter(env.active, order: 1, distance: 40)
                        .wrappedHeading(env)
                    Text(highlight.prompt)
                        .font(.system(.title3, design: .rounded).weight(.bold))
                        .foregroundStyle(w.glow)
                        .fixedSize(horizontal: false, vertical: true)                        .wrappedEnter(env.active, order: 2)
                    HStack(alignment: .bottom, spacing: 5) {
                        ForEach(Array(counts.enumerated()), id: \.offset) { i, c in
                            WrappedBar(height: CGFloat(Double(c) / most) * 170 + 4, color: i == peak && revealed ? w.hot : w.glow.opacity(0.45), grow: revealed || i != peak, delay: Double(i) * 0.03)
                        }
                    }
                    .frame(height: 176, alignment: .bottom)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Messages per day across \(counts.count) days")
                    .wrappedEnter(env.active, order: 3)
                    if !revealed {
                        WrappedTapPill(title: "Reveal the day", color: w.hot, ink: WrappedPalette.ink, identifier: "wrappedReveal", action: onReveal)
                            .wrappedEnter(env.active, order: 4)
                    } else {
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            WrappedCountUp(value: revealed ? Double(highlight.quantity?.value ?? "0") ?? 0 : 0)
                                .animation(reduceMotion ? nil : .easeOut(duration: 1.0), value: revealed)
                                .font(.system(size: 140, weight: .black).width(.compressed))
                                .foregroundStyle(w.hot)
                                .accessibilityLabel(highlight.quantity?.value ?? "")
                            Text(highlight.quantity?.label ?? "")
                                .font(.system(.title2, design: .rounded).weight(.heavy))
                                .foregroundStyle(WrappedPalette.butter)
                        }
                        Text(highlight.quantity?.detail ?? "")
                            .font(.headline.weight(.bold))
                            .foregroundStyle(WrappedPalette.butter)
                        if let first, let last {
                            WrappedEyebrow(text: "First text of the day", color: w.glow)
                            WrappedBubble(quote: first, context: context, fill: w.glow, text: WrappedPalette.ink, caption: w.glow.opacity(0.85))
                            WrappedEyebrow(text: "Last text of the day", color: w.glow)
                            WrappedBubble(quote: last, context: context, fill: w.hot, text: WrappedPalette.ink, caption: w.glow.opacity(0.85))
                        }
                        if !highlight.why.isEmpty {
                            Text(highlight.why)
                                .font(.footnote)
                                .foregroundStyle(w.glow.opacity(0.9))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
    }
}

struct WrappedBar: View {
    let height: CGFloat
    let color: Color
    let grow: Bool
    let delay: Double
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Capsule()
            .fill(color)
            .frame(height: grow ? height * (shown ? 1 : 0.03) : 4)
            .frame(maxWidth: .infinity)
            .onAppear {
                if reduceMotion { shown = true; return }
                withAnimation(.spring(response: 0.7, dampingFraction: 0.75).delay(delay)) { shown = true }
            }
            .animation(reduceMotion ? nil : .spring(response: 0.6, dampingFraction: 0.7), value: grow)
    }
}

// MARK: - Finale and message slides

struct WrappedFinaleScene: View {
    let edition: WrappedEdition
    let context: WrappedStoryContext
    let env: WrappedSlideEnv
    let canWiden: WrappedDateRange?
    let editionCount: Int
    let onAnother: () -> Void
    let onShare: () -> Void
    let onSelectEdition: (Int) -> Void
    let onWiden: (WrappedDateRange) -> Void

    var body: some View {
        let w = context.world
        ZStack {
            LinearGradient(colors: [w.deep, w.mid, w.deep], startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea()
            WrappedGlow(colors: [w.hot.opacity(0.6), w.glow.opacity(0.4), w.mid], active: env.active)
            WrappedScroll {
                VStack(alignment: .leading, spacing: 18) {
                    WrappedEyebrow(text: "Edition \(edition.number) of \(editionCount)", color: w.glow).wrappedEnter(env.active, order: 0)
                    WrappedToastArt(active: env.active)
                        .frame(maxWidth: .infinity)
                    Text("Cheers to you\nand \(context.friend.firstName).")
                        .font(.system(size: 50, weight: .heavy, design: .rounded))
                        .foregroundStyle(WrappedPalette.rainbowText)
                        .minimumScaleFactor(0.5)
                        .wrappedEnter(env.active, order: 1, distance: 40)
                        .wrappedHeading(env)
                    Text("That’s what I found in \(context.range.label(locale: context.locale)).")
                        .font(.system(.headline, design: .rounded).weight(.bold))
                        .foregroundStyle(WrappedPalette.butter)
                        .wrappedEnter(env.active, order: 1)
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(Array(edition.highlights.enumerated()), id: \.offset) { i, h in
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                Text(String(format: "%02d", i + 1))
                                    .font(.system(.title3, design: .serif).weight(.black).italic())
                                    .foregroundStyle(w.hot)
                                Text(h.headline)
                                    .font(.system(.headline, design: .rounded).weight(.bold))
                                    .foregroundStyle(WrappedPalette.butter)
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                    .wrappedEnter(env.active, order: 2)
                    Text(notes)
                        .font(.footnote)
                        .foregroundStyle(w.glow.opacity(0.9))
                        .fixedSize(horizontal: false, vertical: true)
                        .wrappedEnter(env.active, order: 3)
                    VStack(spacing: 12) {
                        finaleButton("Another edition", systemImage: "arrow.triangle.2.circlepath", fill: w.glow, ink: WrappedPalette.ink, id: "wrappedAnotherEdition", action: onAnother)
                        finaleButton("Choose what to share", systemImage: "square.and.arrow.up", fill: nil, ink: WrappedPalette.butter, id: "wrappedShareButton", action: onShare)
                        if let canWiden {
                            Button { onWiden(canWiden) } label: {
                                Label("Try \(canWiden.label(locale: context.locale))", systemImage: "calendar.badge.plus")
                                    .font(.system(.subheadline, design: .rounded).weight(.heavy))
                                    .foregroundStyle(w.glow)
                            }
                            .accessibilityIdentifier("wrappedWiden")
                        }
                        if editionCount > 1 {
                            Menu {
                                ForEach(0..<editionCount, id: \.self) { i in
                                    Button("Edition \(i + 1)") { onSelectEdition(i) }
                                }
                            } label: {
                                Label("Earlier editions", systemImage: "clock.arrow.circlepath")
                                    .font(.system(.subheadline, design: .rounded).weight(.heavy))
                                    .foregroundStyle(w.glow)
                            }
                            .accessibilityIdentifier("wrappedEditionMenu")
                        }
                    }
                    .wrappedEnter(env.active, order: 4)
                }
            }
        }
    }

    private var notes: String {
        var parts = ["I checked every quote against the original message, sender and time."]
        if edition.leftOutCount > 0 {
            parts.append("I left out \(edition.leftOutCount) message\(edition.leftOutCount == 1 ? "" : "s") that looked private or like conflict.")
        }
        return parts.joined(separator: " ")
    }

    private func finaleButton(_ title: String, systemImage: String, fill: Color?, ink: Color, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.system(.headline, design: .rounded).weight(.heavy))
                .foregroundStyle(ink)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background {
                    if let fill { Capsule().fill(fill) } else { Capsule().strokeBorder(ink.opacity(0.8), lineWidth: 2) }
                }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }
}

struct WrappedMessageScene: View {
    let title: String
    let message: String
    let context: WrappedStoryContext
    let env: WrappedSlideEnv
    let actions: [(title: String, id: String, primary: Bool, run: () -> Void)]

    var body: some View {
        let w = context.world
        ZStack {
            LinearGradient(colors: [w.deep, w.mid.opacity(0.9)], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
            WrappedGlow(colors: [w.hot.opacity(0.4), w.mid], active: env.active)
            WrappedScroll {
                VStack(alignment: .leading, spacing: 20) {
                    WrappedEyebrow(text: "Wrapped · \(context.friend.firstName)", color: w.hot).wrappedEnter(env.active, order: 0)
                    WrappedDisplayText(text: title, type: .wide)
                        .foregroundStyle(WrappedPalette.butter)
                        .wrappedEnter(env.active, order: 1, distance: 40)
                        .wrappedHeading(env)
                    Text(message)
                        .font(.body.weight(.medium))
                        .foregroundStyle(WrappedPalette.butter.opacity(0.92))
                        .fixedSize(horizontal: false, vertical: true)
                        .wrappedEnter(env.active, order: 2)
                    ForEach(Array(actions.enumerated()), id: \.offset) { _, a in
                        Button(action: a.run) {
                            Text(a.title)
                                .font(.system(.headline, design: .rounded).weight(.heavy))
                                .foregroundStyle(a.primary ? WrappedPalette.ink : WrappedPalette.butter)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                                .background {
                                    if a.primary { Capsule().fill(w.glow) } else { Capsule().strokeBorder(WrappedPalette.butter.opacity(0.8), lineWidth: 2) }
                                }
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier(a.id)
                        .wrappedEnter(env.active, order: 3)
                    }
                }
            }
        }
    }
}


// MARK: - Finale art: the hedgehog tea toast (finale only)

/// The two halves slide together and clink once. Reduce Motion shows them already together.
struct WrappedToastArt: View {
    let active: Bool
    @State private var clinked = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if let image = UIImage(named: "hedgehog-toast") {
            ZStack {
                Ellipse()
                    .fill(RadialGradient(colors: [WrappedPalette.butter, WrappedPalette.butter.opacity(0)], center: .center, startRadius: 10, endRadius: 190))
                    .frame(width: 290, height: 180)
                half(image, leading: true)
                half(image, leading: false)
            }
            .frame(height: 160)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Two hedgehogs clinking teacups")
            .accessibilityAddTraits(.isImage)
            .onAppear { settle(active) }
            .onChange(of: active) { _, now in settle(now) }
        }
    }

    private func half(_ image: UIImage, leading: Bool) -> some View {
        let together = clinked || reduceMotion
        return Image(uiImage: image)
            .resizable()
            .scaledToFit()
            .frame(width: 250)
            .mask(alignment: leading ? .leading : .trailing) { Rectangle().frame(width: 125) }
            .offset(x: together ? 0 : (leading ? -46 : 46))
            .rotationEffect(.degrees(together ? 0 : (leading ? -5 : 5)), anchor: .bottom)
            .opacity(active || reduceMotion ? 1 : 0)
    }

    private func settle(_ isActive: Bool) {
        guard !reduceMotion else { return }
        if isActive {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.55).delay(0.25)) { clinked = true }
        } else {
            clinked = false
        }
    }
}

// MARK: - Warm moment (only when the warm setting is on)

struct WrappedWarmScene: View {
    let highlight: WrappedHighlight
    let context: WrappedStoryContext
    let env: WrappedSlideEnv
    let state: WrappedSlideState
    let onReveal: () -> Void
    @State private var glow = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let w = context.world
        let first = highlight.quotes(.setup)[0]
        let reply = highlight.quotes(.punchline).first
        let revealed = state.revealed > 0
        ZStack {
            LinearGradient(colors: [w.deep, WrappedPalette.plum.opacity(0.75)], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
            Color.clear
                .overlay {
                    Circle()
                        .fill(RadialGradient(colors: [WrappedPalette.butter.opacity(0.55), .clear], center: .center, startRadius: 0, endRadius: 260))
                        .frame(width: 520, height: 520)
                        .scaleEffect(glow ? 1.08 : 0.92)
                        .offset(y: 120)
                }
                .clipped()
                .ignoresSafeArea()
                .accessibilityHidden(true)
            WrappedScroll {
                VStack(alignment: .leading, spacing: 22) {
                    WrappedEyebrow(text: "A soft spot", color: WrappedPalette.coral).wrappedEnter(env.active, order: 0)
                    WrappedDisplayText(text: highlight.headline, type: .serifItalic)
                        .foregroundStyle(WrappedPalette.butter)
                        .wrappedEnter(env.active, order: 1, distance: 40)
                        .wrappedHeading(env)
                    WrappedBubble(quote: first, context: context, fill: WrappedPalette.periwinkle, text: WrappedPalette.ink, caption: WrappedPalette.butter.opacity(0.85))
                        .wrappedEnter(env.active, order: 2, distance: 34)
                    if let reply {
                        if revealed {
                            WrappedBubble(quote: reply, context: context, fill: WrappedPalette.coral, text: WrappedPalette.ink, caption: WrappedPalette.butter.opacity(0.85))
                                .transition(.opacity)
                        } else {
                            WrappedTapPill(title: "Read the reply", color: WrappedPalette.coral, ink: WrappedPalette.ink, identifier: "wrappedReveal", action: onReveal)
                                .wrappedEnter(env.active, order: 3)
                        }
                    }
                    if !highlight.why.isEmpty {
                        Text(highlight.why)
                            .font(.footnote)
                            .foregroundStyle(WrappedPalette.butter.opacity(0.9))
                            .fixedSize(horizontal: false, vertical: true)
                            .wrappedEnter(env.active, order: 4)
                    }
                }
            }
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 3).repeatForever(autoreverses: true)) { glow = true }
        }
    }
}
#endif

