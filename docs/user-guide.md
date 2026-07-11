# My Tasco — User Guide

Welcome! **My Tasco** is our company's knowledge assistant. Think of it as a smart search bar for everything the company knows — policies, processes, and know-how — except instead of handing you a pile of documents to read, it gives you a straight answer and shows you exactly where that answer came from.

This guide is written for everyone, not just the tech team. No prior experience needed.

---

## 1. How to access the platform

1. Open your web browser (Chrome, Edge, Firefox, Safari — any of them work).
2. Go to: **http://127.0.0.1:5173** (your team lead will tell you if the address is different, e.g. a shared company URL).
3. You'll land on the sign-in page.

[Screenshot: Login page showing the "My Tasco" welcome card and a list of persona buttons]

### Signing in

For this demo environment, there's no password to remember. Instead, you sign in by picking a **persona** — a sample identity that shows what the assistant looks like for different roles in the company:

| Persona | Role | Department |
|---|---|---|
| Maya Chen | Employee | Engineering |
| Sarah Kim | Manager | Finance |
| Jonas Patel | Manager | Human Resources |
| Elliot Rivera | Director | Product |
| Priya Rao | Executive | Executive |

Just click the card with the name you want to sign in as. You'll be taken straight into the app as that person — including whatever that person is allowed to see (more on that below).

> If your company has real single sign-on set up, you'll instead see a **"Continue with SSO"** button at the top of the page — use that to sign in with your normal company account.

Once signed in, you'll see your name and role in the bottom-left corner, along with a **Sign out** button whenever you want to switch personas or leave.

[Screenshot: Signed-in view showing the sidebar with user name, role, and department]

---

## 2. How to ask questions

Click **Ask** in the left sidebar (it's usually the page you land on after signing in). You'll see a single text box — that's it. No special syntax, no keywords, just type your question the way you'd ask a coworker.

[Screenshot: Ask page with an empty question box and "Ask" button]

### Example questions to try

- "How many annual leave days do I get?"
- "What's the process for submitting a travel expense claim?"
- "What tools do I need to set up my dev environment?"
- "How long do we retain customer data?"
- "What's the process for a product release?"
- "What are the engineering salary bands?" *(only visible to the right people — see Section 4)*
- "What are the strategic priorities for 2027?" *(executive-only)*

Type your question, click **Ask** (or press Enter), and wait a few seconds while it says "Thinking…" — it's reading through the relevant documents and putting together an answer just for you.

**Tip:** you can ask the same way you'd ask a person — full sentences, casual phrasing, even a little vague. You don't need to guess the "right" keywords.

---

## 3. Understanding the answer

Once the assistant responds, you'll see a few things on screen:

[Screenshot: Answer card showing a confidence badge, the answer text, source cards, and a "hidden" notice]

### The answer itself

A plain-English answer, written in a few sentences, with small numbers like `[1]` and `[2]` sprinkled in. Those numbers are **citations** — they point to exactly which source backs up that part of the answer, so you never have to just take the assistant's word for it.

### Confidence badge

At the top of the answer card is a small colored badge that says **high confidence**, **medium confidence**, or **low confidence**. Here's what that means in plain terms:

| Badge | What it means |
|---|---|
| **High confidence** | The assistant found a document that closely and directly matches your question. Trust this one. |
| **Medium confidence** | It found something related, but it's a partial match — worth a quick double-check, especially for anything important. |
| **Low confidence** | It found something only loosely related. Treat this as a starting point, not a final answer — consider asking a person too. |
| *(No badge / "I don't have information about that")* | Nothing relevant was found in the documents it can see. This isn't a failure — it just means the answer isn't in the knowledge base yet, or you may not have access to it. |

### Sources

Below the answer, under **Sources**, you'll find a card for each document the answer drew from — the filename and a short snippet of the actual text. Click through mentally (or just read the snippet) to sanity-check the answer against the original wording.

### "Documents hidden" notice

Sometimes you'll see a small banner like:

> **1 document hidden by access level**

This means the assistant found something else that was relevant to your question, but it belongs to a more restricted category than your account can see (for example, confidential HR data if you're not a manager, or executive-only strategy documents). It doesn't reveal what the hidden content says — just that something exists. This is intentional: it's how the assistant respects who's allowed to see what, the same way a person would say "that's above my pay grade" instead of making something up or leaking it.

If you believe you should have access to something that's hidden, talk to your manager or the document owner.

---

## 4. How to upload documents

If you have a document that should be part of the shared knowledge base (a policy, a how-to guide, meeting notes, anything useful to others), you can add it yourself.

1. Click **Upload** in the left sidebar.
2. Drag your file onto the box, or click it to open a file picker.

   Supported file types: **PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), plain text (.txt), and Markdown (.md)**.

[Screenshot: Upload page with the drag-and-drop zone, classification dropdown, and team field]

3. Choose a **Classification** — this controls who else can see the document once it's uploaded. Pick the option that matches how sensitive the content is.
4. The **Team** field is filled in automatically based on your department — you don't need to change it.
5. Click **Upload**. You'll see a confirmation once it's processed and added to the knowledge base.

### What do the classification levels mean?

Think of these like labels on a filing cabinet drawer — they decide who's allowed to open it later.

| Classification | Who can see it | Use it for... |
|---|---|---|
| **Public** | Everyone at the company | Things you'd be comfortable posting on a public company blog — general info, marketing material, the employee handbook cover page. |
| **Internal** | Everyone at the company | The everyday stuff — team processes, how-to guides, meeting notes, general policies. This is the right default for most uploads. |
| **Confidential** | Managers and above, but **only within the same department** | Sensitive information that should stay inside a specific team — salary bands, performance reviews, internal financials for that department. |
| **Restricted** | Executives only | The most sensitive material — company strategy, M&A plans, board materials, anything that could cause real harm if it leaked. |

**Rule of thumb:** if you're not sure, ask "would I mind if the whole company read this?" — if yes, pick Internal. If it's team-sensitive, pick Confidential. If it's genuinely top-secret, pick Restricted. When in doubt, ask your manager before uploading.

---

## 5. Tips for getting good answers

- **Ask like you'd ask a colleague.** "How much annual leave do I get?" works better than typing keywords like "leave policy days."
- **Be specific when it matters.** "What's the expense claim process for international travel?" gets you a sharper answer than just "expenses."
- **Check the confidence badge before you rely on an answer** for anything important — treat medium/low confidence answers as a starting point.
- **Skim the sources, not just the answer.** The citation snippets are short but let you verify the answer is actually grounded in a real document.
- **If you get "I don't have information about that,"** it might mean the document doesn't exist yet in the system — consider uploading it once you find or create it, so the next person gets an answer.
- **If you see a "hidden" notice** and you have a genuine business need to see it, that's a conversation for your manager, not a workaround to look for.
- **One question at a time works best.** If you have three unrelated questions, ask them one at a time rather than combining them into one long message.

---

## 6. FAQ / Troubleshooting

**Q: Do I need a password?**
A: Not in this demo setup — you sign in by choosing a persona. If your company has real single sign-on enabled, use the "Continue with SSO" button instead.

**Q: The assistant said "I don't have information about that in the available documents." Is something broken?**
A: No — it's being honest rather than guessing. It means nothing in the documents it can access matches your question closely enough. Try rephrasing, or check with a person on the relevant team. If you know the answer exists somewhere, consider uploading the source document.

**Q: Why can't I see a document that a coworker mentioned?**
A: It's likely classified as Confidential or Restricted, and your role or department doesn't have access. This is by design — the assistant will tell you a hidden document exists ("N document hidden by access level") without revealing its contents. Ask your manager if you believe you need access.

**Q: I uploaded a document but it's not showing up in answers yet.**
A: Give it a moment — documents are processed right after upload, and you'll see a confirmation banner with a document ID once it's done. If it still doesn't appear in answers after a few minutes, try asking a more specific question that matches the document's content, or check with an admin that the upload actually completed.

**Q: Can I upload any file type?**
A: Currently supported types are PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), plain text (.txt), and Markdown (.md). Other formats (images, video, zipped folders, etc.) aren't supported yet.

**Q: What classification should I pick if I'm not sure?**
A: Default to **Internal** for everyday work documents. Only choose Confidential or Restricted if the content would cause real harm if the wrong person saw it — and if you're unsure, ask your manager before uploading.

**Q: Can I trust the answers completely, without checking anything?**
A: Use the confidence badge and sources as your guide. High confidence with clear source citations is generally reliable, but for anything with real consequences (money, compliance, legal, HR decisions), always verify against the source document or a knowledgeable person before acting.

**Q: Who do I contact if something looks wrong or broken?**
A: Reach out to your team lead or the platform admin. If an answer looks factually wrong, flag it — that's valuable feedback for keeping the knowledge base accurate.

**Q: I signed in as the wrong persona. How do I switch?**
A: Click **Sign out** in the bottom-left corner, then pick a different persona from the login page.

---

*This guide covers the everyday experience of using My Tasco. If you're setting up the platform itself or managing access levels for your team, check with your platform admin for additional setup documentation.*
