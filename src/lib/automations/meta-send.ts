import { sendTextMessage, sendTemplateMessage, sendMediaMessage } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils'
import { supabaseAdmin } from './admin-client'

// ------------------------------------------------------------
// Automation-side Meta sender.
//
// Mirrors the logic in src/app/api/whatsapp/send/route.ts but uses
// the service-role client (engine has no cookies) and accepts the
// user / conversation / contact identifiers the engine already has
// on hand. Kept here (rather than refactoring the user-facing send
// route) to avoid risk to the working manual-send path — they can
// converge in a later refactor.
// ------------------------------------------------------------

interface SendTextArgs {
  userId: string
  conversationId: string
  contactId: string
  text: string
}

interface SendTemplateArgs {
  userId: string
  conversationId: string
  contactId: string
  templateName: string
  language?: string
  params?: string[]
}

export async function engineSendText(args: SendTextArgs): Promise<{ whatsapp_message_id: string }> {
  return sendViaMeta({ ...args, kind: 'text' })
}

export async function engineSendTemplate(
  args: SendTemplateArgs,
): Promise<{ whatsapp_message_id: string }> {
  return sendViaMeta({ ...args, kind: 'template' })
}

interface SendMediaArgs {
  userId: string
  conversationId: string
  contactId: string
  mediaType: 'image' | 'document'
  link: string
  caption?: string
  filename?: string
}

export async function engineSendMedia(
  args: SendMediaArgs,
): Promise<{ whatsapp_message_id: string }> {
  return sendViaMeta({ ...args, kind: 'media' })
}

type SendInput =
  | (SendTextArgs & { kind: 'text' })
  | (SendTemplateArgs & { kind: 'template' })
  | (SendMediaArgs & { kind: 'media' })

async function sendViaMeta(input: SendInput): Promise<{ whatsapp_message_id: string }> {
  const db = supabaseAdmin()

  // Scope the contact lookup by user_id. The engine uses the
  // service-role client (bypassing RLS), and the public
  // /api/automations/engine endpoint accepts contact_id from the
  // request body — without this filter, an authenticated user could
  // fire their own automations against another tenant's contact UUID
  // and send via their own WhatsApp config to that contact's phone.
  // Practical risk is low (UUIDs are unguessable) but the check is
  // cheap defense-in-depth.
  const { data: contact, error: contactErr } = await db
    .from('contacts')
    .select('id, phone')
    .eq('id', input.contactId)
    .eq('user_id', input.userId)
    .maybeSingle()
  if (contactErr || !contact?.phone) {
    throw new Error('contact not found for this user')
  }

  const sanitized = sanitizePhoneForMeta(contact.phone)
  if (!isValidE164(sanitized)) {
    throw new Error(`contact phone invalid: ${contact.phone}`)
  }

  const { data: config, error: configErr } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('user_id', input.userId)
    .single()
  if (configErr || !config) {
    throw new Error('WhatsApp not configured for this account')
  }

  const accessToken = decrypt(config.access_token)

  const attempt = async (phone: string): Promise<string> => {
    if (input.kind === 'template') {
      const r = await sendTemplateMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        templateName: input.templateName,
        language: input.language,
        params: input.params,
      })
      return r.messageId
    }
    if (input.kind === 'media') {
      const r = await sendMediaMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        mediaType: input.mediaType,
        link: input.link,
        caption: input.caption,
        filename: input.filename,
      })
      return r.messageId
    }
    const r = await sendTextMessage({
      phoneNumberId: config.phone_number_id,
      accessToken,
      to: phone,
      text: input.text,
    })
    return r.messageId
  }

  // Same phone-variant retry as /api/whatsapp/send — Meta sandbox and
  // numbers registered with/without a trunk 0 both require this to
  // reliably land a message.
  const variants = phoneVariants(sanitized)
  let workingPhone = sanitized
  let waMessageId = ''
  let lastError: unknown = null
  for (const v of variants) {
    try {
      waMessageId = await attempt(v)
      workingPhone = v
      lastError = null
      break
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!isRecipientNotAllowedError(msg)) throw err
      lastError = err
    }
  }
  if (lastError) throw lastError

  if (workingPhone !== sanitized) {
    await db.from('contacts').update({ phone: workingPhone }).eq('id', contact.id)
  }

  // Persist the sent message so it appears in the inbox with a real
  // Meta message id. sender_type='bot' distinguishes automation sends
  // from manual agent sends.
  const content_type =
    input.kind === 'template'
      ? 'template'
      : input.kind === 'media'
        ? input.mediaType // 'image' | 'document' — dono CHECK constraint me allowed hain
        : 'text'
  const content_text =
    input.kind === 'text'
      ? input.text
      : input.kind === 'media'
        ? input.caption ?? null
        : null
  const template_name = input.kind === 'template' ? input.templateName : null
  const media_url = input.kind === 'media' ? input.link : null

  const { error: msgErr } = await db.from('messages').insert({
    conversation_id: input.conversationId,
    sender_type: 'bot',
    content_type,
    content_text,
    template_name,
    media_url,
    message_id: waMessageId,
    status: 'sent',
  })
  if (msgErr) {
    // Meta already has the message; record the DB error but don't pretend
    // the send failed. The engine wraps this in a log line.
    throw new Error(`sent to Meta but DB insert failed: ${msgErr.message}`)
  }

  const lastText =
    input.kind === 'template'
      ? `[template:${input.templateName}]`
      : input.kind === 'media'
        ? input.caption ?? `[${input.mediaType}]`
        : input.text

  await db
    .from('conversations')
    .update({
      last_message_text: lastText,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.conversationId)

  return { whatsapp_message_id: waMessageId }

}
// ------------------------------------------------------------
// Typing indicator — shows "typing..." + marks message as read.
// Meta combines read-receipt and typing into one call. Best-effort.
// ------------------------------------------------------------

interface SendTypingArgs {
  userId: string
  incomingMessageId: string
}

export async function engineSendTyping(args: SendTypingArgs): Promise<void> {
  const db = supabaseAdmin()

  try {
    const { data: config, error: configErr } = await db
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('user_id', args.userId)
      .single()
    if (configErr || !config) return

    const accessToken = decrypt(config.access_token)

    await fetch(
      `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: args.incomingMessageId,
          typing_indicator: { type: 'text' },
        }),
      },
    )
  } catch (err) {
    console.error('[meta-send] typing indicator failed:', err)
  }
}// ------------------------------------------------------------
// Read receipt only — blue tick without typing bubble.
// Runs for EVERY incoming message (even ones that get batched/
// skipped) so the customer always sees their message was read.
// Best-effort.
// ------------------------------------------------------------

export async function engineSendRead(args: SendTypingArgs): Promise<void> {
  const db = supabaseAdmin()

  try {
    const { data: config, error: configErr } = await db
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('user_id', args.userId)
      .single()
    if (configErr || !config) return

    const accessToken = decrypt(config.access_token)

    await fetch(
      `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: args.incomingMessageId,
        }),
      },
    )
  } catch (err) {
    console.error('[meta-send] read receipt failed:', err)
  }
}