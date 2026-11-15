# Textrovert product brief

## One-line idea
Textrovert helps you stay close to friends by making it easy to remember what matters, understand a conversation in context, and find a natural reason to reconnect.

## Product promise
Ask about a friend and get a useful answer grounded in your own conversations with them. Bring a screenshot into the same friend chat when you want help understanding that image or its conversation. Textrovert shows where its answer came from and lets you decide what to do next.

## Audience and need
People who care about a wider circle of friends but struggle to remember plans, interests, meaningful details, or the context behind a text. The product should feel like a warm personal notebook, not a contact database, inbox monitor, or task manager.

## Core product model
One private, user-controlled space per friend. Each friend has:
- A conversation chat where the user can ask about history and optionally attach a photo.
- Useful, editable details such as shared activities, plans, gifts, memories, and replies to follow up on.
- Source references so a person can inspect which imported message or selected image informed a detail.
- A conversation-specific Wrapped recap that finds distinct moments in that friend's chat.

The user chooses which conversations or screenshots to add. Avoid scraping, silent imports, auto-sending, friendship scores, and guilt-based reminders.

## Core flows

### Find a friend or activity
Search by name, handle, or an activity such as “need a +1 for volleyball.” Show why a friend matched. Do not claim they are available. Back returns to the exact query and result list. When no direct match exists, explain that plainly and, if supported by evidence, offer a related interest with its source.

### Friend profile
Lead with concise summaries rather than quotes. Organize plans, activities, memories, gifts, and follow-ups into recognizable sections. Tapping an item reveals its original source. Users can add or correct details and see whether each came from a message or their own note.

### Ask in one friend-scoped chat
The person’s imported chat history is the default context. The same composer can attach a user-selected image. A question can be about the friend/history, about the selected image, or explicitly about both. If intent to combine sources is ambiguous, ask first. Show visible source chips and let the user remove a photo or change which conversations are included.

Answers distinguish direct facts from interpretations. Interpretations stay tentative and name what cannot be known from messages. Quotes are resolved against original source messages before display. Suggested replies are editable drafts. Nothing is sent automatically.

For screenshots, show the selected image in the same chat. Findings can be pinned to normalized image regions and opened as annotations. A short scan-line reveal is a visual transition after the result is ready, not an assertion of live pixel-by-pixel analysis. Cite visible regions and readable text, and flag uncertain OCR.

### Wrapped
Generate a conversation-specific story from that friend’s messages and a clear date range. Select evidence-backed standouts such as a callback across weeks, a joke that escalates, an unexpected topic pivot, or a distinctive invitation. The set and storytelling should vary by conversation and on “Another edition.” Verify quotations and speakers against source messages. Show source and date. Ghost-style reply timing describes only the user's own completed response gaps, stays neutral about intent, and remains private unless selected. Preview exact excerpts before sharing.

## Design direction
Friendly, memorable notebook/scrapbook character with strong type hierarchy, recognizable section colors, warm paper-like backgrounds, and occasional handmade illustration. Keep core navigation and text legible. Use animation to reveal content with purpose, not as constant decoration. Wrapped can use bolder full-screen compositions and richer colors. Reduce Motion, Dynamic Type, VoiceOver, and dark appearance must remain supported. The paired-otter outline is a logo exploration, not yet a final asset.

## Trust and privacy
- User selects and controls imported chats and images.
- Ask is scoped to the selected friend and source chips show what context is active.
- Never invent quotations, dates, availability, or emotional certainty.
- Never infer mental-health or other sensitive traits.
- No automatic message sending.
- Real private screenshots must not appear in demo fixtures, logs, public previews, or AI coding-agent prompts.
- Before real cloud image processing, add owner authentication, authorization checks, retention rules, and deletion. Current Convex backend documentation says its functions are unauthenticated.

## Hackathon scope and current implementation
The current product is a native SwiftUI iPhone app on the `fe/textrovert-app` branch, using fictional fixtures. Today summaries, references, search, a lightweight friend profile, and Mia's sample conversation analysis exist. The sample answer and editable reply are fixtures, not live model analysis. The Convex backend has chat import and file storage work from Nelson. Chat-provider integrations are represented in UI only.

Current Capy work is split into:
1. Profile editing, search navigation, coherent color hierarchy, notebook grid/parallax, birthday reminder, and source presentation.
2. A separate conversation-specific Wrapped component and fixture-driven edition selection.
3. After those chunks, one friend chat with an optional PhotosPicker image, fixture scan/pin analysis, and citation checks. Real private uploads and model calls follow authentication and retention work.

An installable PWA can accept an image selected from its own picker and update from its hosted site. iOS PWA does not currently receive images directly from the Photos share sheet. Native iOS remains the hackathon target; a native Share Extension may later provide direct photo-to-Textrovert sharing.

## Questions for product brainstorming
- What is the most delightful “I know this friend” moment users would share or return for?
- Which first use case earns permission to import one chat?
- What should the home screen surface today without making friendship feel like a checklist?
- Which Wrapped moments feel funny or affectionate without exposing a private exchange?
- How should users choose boundaries for a friend chat, groups, date ranges, and images?
- What is the smallest convincing on-device demo that makes the analysis feel trustworthy?
- What should be local-only, and what needs synced Convex storage?
- Which acquisition loop matters most: search/activity matching, friend memory, screenshot analysis, or Wrapped sharing?
