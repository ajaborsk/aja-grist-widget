// We don't really need full access, but since we are using Grist API, we need full access here
grist.ready({
  requiredAccess: 'full',
  columns: [
    {
      name: 'to', // What field we will read.
      title: 'Destinataire(s) = To', // Friendly field name.
      optional: false, // Is this an optional field.
      type: 'Text,Ref,RefList', // What type of column we expect.
      description:
        'Colonne(s) qui contien(nen)t les destinataires du message à envoyer. Les destinataires dans un champ texte doivent être séparés par des virgules <,> ou des point-virgules <;>.',
      allowMultiple: true // Allows multiple column assignment.
    },
    {
      name: 'cc', // What field we will read.
      title: 'Destinataire(s) en copie = Cc', // Friendly field name.
      optional: true, // Is this an optional field.
      type: 'Text,Ref,RefList', // What type of column we expect.
      description:
        'Colonne(s) qui contien(nen)t les destinataires du message à envoyer. Les destinataires dans un champ texte doivent être séparés par des virgules <,> ou des point-virgules <;>.',
      allowMultiple: true // Allows multiple column assignment.
    },
    {
      name: 'bcc', // What field we will read.
      title: 'Destinataire(s) en copie cachée= Bcc', // Friendly field name.
      optional: true, // Is this an optional field.
      type: 'Text,Ref,RefList', // What type of column we expect.
      description:
        'Colonne(s) qui contien(nen)t les destinataires du message à envoyer. Les destinataires dans un champ texte doivent être séparés par des virgules <,> ou des point-virgules <;>.',
      allowMultiple: true // Allows multiple column assignment.
    },
    {
      name: 'attachments', // What field we will read.
      title: 'Pièces jointes', // Friendly field name.
      optional: true, // Is this an optional field.
      type: 'Attachments', // What type of column we expect.
      description: 'Colonne(s) qui contien(nen)t les pièces à joindre',
      allowMultiple: false // Should allows multiple column assignment.
    },
    {
      name: 'parameters', // What field we will read.
      title: 'Colonnes paramètres', // Friendly field name.
      optional: true, // Is this an optional field.
      type: 'Text', // What type of column we expect.
      description:
        'Colonne(s) qui contien(nen)t les données utilisée pour créer le corps du texte',
      allowMultiple: true // Allows multiple column assignment.
    }
  ]
})

/**
 * Convert HTML -> plain text while preserving line breaks.
 * - Strips tags, scripts, styles
 * - Inserts \n for block elements and <br>
 * - Preserves whitespace inside <pre>
 *
 * (generated with Copilot/ChatGPT-5)
 * BTW, Chat-GPT sucks at coding: this code remove spaces between words...
 */
function htmlToPlainText (html) {
  // Use DOM to decode entities and read text safely
  const root = document.createElement('div')
  root.innerHTML = html || ''

  // Remove non-content elements
  root.querySelectorAll('script, style, noscript').forEach(n => n.remove())

  // Block elements that should end with a line break in text
  const BLOCK_TAGS = new Set([
    'ADDRESS',
    'ARTICLE',
    'ASIDE',
    'BLOCKQUOTE',
    'DIV',
    'DL',
    'DT',
    'DD',
    'FIELDSET',
    'FIGCAPTION',
    'FIGURE',
    'FOOTER',
    'FORM',
    'HEADER',
    'HR',
    'LI',
    'MAIN',
    'NAV',
    'OL',
    'P',
    'PRE',
    'SECTION',
    'TABLE',
    'THEAD',
    'TBODY',
    'TFOOT',
    'TR',
    'UL',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6'
  ])

  const out = []

  function walk (node, inPre = false) {
    const type = node.nodeType

    if (type === Node.TEXT_NODE) {
      let text = node.nodeValue || ''
      // Collapse whitespace unless inside <pre>
      if (!inPre) {
        text = text.replace(/\s+/g, ' ')
      }
      out.push(text)
      return
    }

    if (type !== Node.ELEMENT_NODE) return

    const tag = node.tagName

    if (tag === 'BR') {
      out.push('\n')
      return
    }

    const nextInPre = inPre || tag === 'PRE'

    // Recurse into children
    for (const child of node.childNodes) {
      walk(child, nextInPre)
    }

    // After block elements, add a newline
    if (BLOCK_TAGS.has(tag)) {
      out.push('\n')
    }
  }

  walk(root)

  // Join and tidy up
  let text = out.join('')

  // Normalize line endings
  text = text.replace(/\r\n?/g, '\n')

  // Trim spaces at line ends
  text = text
    .split('\n')
    .map(line => line.replace(/[ \t]+\b/g, '').replace(/[ \t]+$/g, ''))
    .join('\n')

  // Collapse >2 consecutive newlines into exactly 2
  text = text.replace(/\n{3,}/g, '\n\n')

  // Trim start/end
  return text.trim()
}

/**
 * Guess a file mime type based on its filename
 *
 * (generated with Copilot/ChatGPT-5)
 */
function guessMimeType (filename) {
  const ext = filename.split('.').pop().toLowerCase()

  const mimeMap = {
    // Documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    odt: 'application/vnd.oasis.opendocument.text',
    rtf: 'application/rtf',
    txt: 'text/plain',

    // Spreadsheets
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    csv: 'text/csv',

    // Presentations
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    odp: 'application/vnd.oasis.opendocument.presentation',

    // Images
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    svg: 'image/svg+xml',

    // Archives (often used for office bundles)
    zip: 'application/zip'
  }

  return mimeMap[ext] || 'application/octet-stream' // default fallback
}

// Get the textarea element
html_template_element = document.getElementById('html_template')

// Fill the textarea element with previously saved value
grist.getOption('html_template').then(v => {
  if (v !== undefined) {
    html_template_element.value = v
  } else {
    html_template_element.value =
      '<html>\n' +
      '  <head>\n' +
      '  </head>\n' +
      '  <body>\n' +
      '    ...insert here your body contents...\n' +
      '  </body>\n' +
      '</html>\n'
  }
})

// If the textarea value change, update the 'html_template' option with this value
html_template_element.addEventListener('input', event => {
  //console.log("Input", event, this.target);
  console.log(event.target.value)
  grist.setOption('html_template', event.target.value)
})

// Get the subject template element
subject_template_element = document.getElementById('subject_template')

// Fill the subject template element with previously saved value
grist.getOption('subject_template').then(v => {
  if (v !== undefined) {
    subject_template_element.value = v
  } else {
    subject_template_element.value = ''
  }
})

// If the subject template change, update the 'subject_template' option with this value
subject_template_element.addEventListener('input', event => {
  grist.setOption('subject_template', event.target.value)
})

// grist.onRecords(table => {})

// Fonction qui convertit le contenu d'un blob en chaîne de caractères qui représente les données du blob encodé en base64
async function blobToBase64 (blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result.split(',')[1]) // Extract Base64 part
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// Build a array of email addresses from a list of fields.
// Each field can be either a comma separated list of emails, a reference or multiple references
async function buildAddressesList (record, fields_list) {
  let addr_list = []
  for (i = 0; i < fields_list.length; i++) {
    field_name = fields_list[i]
    field_value = record[field_name]
    if (typeof field_value === 'string') {
      // TODO: Handle <;> or <,> separated addresses and strip values...
      // TODO: Check addresses syntax (using re ?)
      addr_list.push(field_value)
    }
    // TODO: Handle Ref & RefList types
  }
  return addr_list
}

// This fonction build a email from a Grist record, column names & templates
// Returns a object :
//  - message : the message itself (a mimemessage object)
//  - subject_preview : the subject preview (a string)
//  - boby_preview : the html body preview (a string)
//  - attachements : the attachements filenames (list of strings)
//  - error_message : a humain readable error message (null or a string)
function build_email (
  record,
  to_fields,
  cc_fields,
  cci_fields,
  attachement_fields,
  subject_template,
  html_body_template
) {
  // The main message
  const message = mimemessage.factory({
    contentType: 'multipart/mixed',
    body: []
  })

  // TODO...

  return {
    message: message,
    suject_preview: '',
    body_preview: '',
    attachements: [],
    error: null
  }
}

grist.onRecord(
  async (record, mappings) => {
    var errorMessage = null

    // The main message
    const message = mimemessage.factory({
      contentType: 'multipart/mixed',
      body: []
    })

    // Standard headers ================================================================================================

    const to_addrs = await buildAddressesList(record, mappings.to)
    const cc_addrs = await buildAddressesList(record, mappings.cc)
    const bcc_addrs = await buildAddressesList(record, mappings.bcc)

    // From & Date header are meant to be set by the email client, not this code
    // message_2.header('From', 'Alice <alice@example.com>');
    // message_2.header('Date', new Date().toUTCString())

    message.header('MIME-Version', '1.0')

    message.header('To', to_addrs.join(', '))
    message.header('Cc', cc_addrs.join(', '))
    message.header('Bcc', bcc_addrs.join(', '))

    let subject_text
    try {
      const subject_template = Handlebars.compile(
        subject_template_element.value
      )
      subject_text = subject_template(record)
    } catch (error) {
      errorMessage = 'Erreur en inteprétant le sujet du message : ' + error
      subject_text = '#Erreur : ' + error
    }
    message.header('Subject', subject_text)

    // This message hasn't been sent and should be opened as is
    // So we don't add a 'Date' header (which is mandatory) and add a X-Unsent flag instead
    message.header('X-Unsent', '1')

    // Email (basic) contents ========================================================================================

    // Build the html message body from the template and grist object parameters
    let body_html_content
    try {
      const body_template = Handlebars.compile(html_template_element.value)
      body_html_content = body_template(record)
    } catch (error) {
      body_html_content = '#Erreur : ' + error
      errorMessage = 'Erreur en interprétant le corps du message : ' + error
    }

    // the "true" message part = the text/html body + the related parts (=images)

    const message_part = mimemessage.factory({
      contentType: 'multipart/related',
      body: []
    })

    const alt = mimemessage.factory({
      contentType: 'multipart/alternative',
      body: []
    })
    alt.body.push(
      // The (fallback) text message body
      mimemessage.factory({
        contentType: 'text/plain; charset=utf-8',
        body: htmlToPlainText(body_html_content)
      })
    )
    // The html message body
    alt.body.push(
      mimemessage.factory({
        contentType: 'text/html; charset=utf-8',
        body: body_html_content
      })
    )

    // Add here the related attachements ?
    // related attachments (ie images...) MUST be attached to the message_part ("multipart/related") and this message_part
    // attached to the message BEFORE the other attachement
    // ==> create a function to get an attachment from grist...

    message_part.body.push(alt)

    message.body.push(message_part)

    // Email attachments ============================================================================================

    let attachments = []

    // get a tmp grist API token
    const tokenInfo = await grist.docApi.getAccessToken({ readOnly: true })

    // Loops over attachments
    for (idx = 0; idx < record[mappings.attachments].length; idx++) {
      // the attachment (grist) id
      const att_id = record[mappings.attachments][idx]

      // Download the attachment metadata (to get the filename)
      const att_meta = await (
        await fetch(
          `${tokenInfo.baseUrl}/attachments/${att_id}?auth=${tokenInfo.token}`,
          { method: 'GET' }
        )
      ).json()

      // Download the attachment contents
      const att_response = await fetch(
        `${tokenInfo.baseUrl}/attachments/${att_id}/download?auth=${tokenInfo.token}`,
        { method: 'GET' }
      )
      // TODO: Should probably check the responses...

      // Keep filename for the preview
      attachments.push(att_meta.fileName)

      // Build the attachement contents
      const attachment = mimemessage.factory({
        contentType:
          guessMimeType(att_meta.fileName) +
          '; name="' +
          att_meta.fileName +
          '"',
        contentTransferEncoding: 'base64',
        // TODO: cut this very long string with \r\n every 75 characters...
        body: await blobToBase64(await att_response.blob())
      })

      //TODO... Sort between attachments & inline
      if (false) {
        // inline mode ==> Wrong ! put that earlier in the message building process (before adding message_part to message)
        attachment.header(
          'Content-Disposition',
          'inline; filename="' + att_meta.fileName + '"'
        )
        attachment.header('Content-Id', '<' + 'popo.123456789' + '>')
        message_part.body.push(attachment)
      } else {
        // regular attachment
        attachment.header(
          'Content-Disposition',
          'attachment; filename="' + att_meta.fileName + '"'
        )
        message.body.push(attachment)
      }
    }

    // Update the preview
    let preview_div = document.getElementById('preview')
    preview_div.innerHTML =
      '<u>Sujet :</u> ' +
      subject_text +
      '<hr>' +
      body_html_content +
      '<hr><u>Pièces jointes :</u> ' +
      attachments.join(', ') +
      '<hr>'

    // Build a blob with the whole message
    let blob = new Blob([message.toString()], { type: 'message/rfc822' })

    // Create a tmp URL to this blob
    let url = URL.createObjectURL(blob)

    // Update the link so it triggers the download
    let msg_send_elt = document.getElementById('send')
    msg_send_elt.setAttribute('href', url)
    msg_send_elt.setAttribute('download', 'message.eml')
  },
  { includeColumns: 'normal' }
)
