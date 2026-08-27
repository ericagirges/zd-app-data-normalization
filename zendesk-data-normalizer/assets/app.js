(() => {
  'use strict';

  const client = ZAFClient.init();
  const output = document.getElementById('output');
  const status = document.getElementById('status');
  const copyButton = document.getElementById('copyButton');
  const refreshButton = document.getElementById('refreshButton');
  const includeEmail = document.getElementById('includeEmail');
  const includeInternal = document.getElementById('includeInternal');

  let normalizedPayload = null;

  const ticketProperties = [
    'ticket.id',
    'ticket.subject',
    'ticket.description',
    'ticket.status',
    'ticket.priority',
    'ticket.type',
    'ticket.tags',
    'ticket.createdAt',
    'ticket.updatedAt',
    'ticket.requester.id',
    'ticket.requester.name',
    'ticket.requester.email',
    'ticket.assignee.user.id',
    'ticket.assignee.user.name',
    'ticket.assignee.group.id',
    'ticket.assignee.group.name',
    'ticket.organization.id',
    'ticket.organization.name',
    'ticket.brand.id',
    'ticket.brand.name',
    'ticket.form.id',
    'ticket.form.name',
    'ticket.via',
    'ticket.conversation',
    'ticketFields'
  ];

  function cleanString(value) {
    if (value === null || value === undefined) return null;
    return String(value).replace(/\s+/g, ' ').trim() || null;
  }

  function stripHtml(value) {
    if (!value) return null;
    const doc = new DOMParser().parseFromString(String(value), 'text/html');
    return cleanString(doc.body.textContent || '');
  }

  function slugify(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  function compactObject(obj) {
    return Object.fromEntries(
      Object.entries(obj).filter(([, value]) => {
        if (value === null || value === undefined || value === '') return false;
        if (Array.isArray(value) && value.length === 0) return false;
        return true;
      })
    );
  }

  function property(data, key) {
    return data[key] === undefined ? null : data[key];
  }

  function normalizePrimitive(value) {
    if (typeof value === 'string') return cleanString(value);
    if (Array.isArray(value)) return value.map(normalizePrimitive).filter(v => v !== null && v !== '');
    return value ?? null;
  }

  async function getCustomFields(ticketFields) {
    const customFields = (ticketFields || []).filter(field => field && field.name && /^custom_field_\d+$/.test(field.name));
    if (!customFields.length) return [];

    const keys = customFields.map(field => `ticket.customField:${field.name}`);
    const values = await client.get(keys);

    return customFields.map(field => {
      const id = Number(field.name.replace('custom_field_', ''));
      const rawValue = values[`ticket.customField:${field.name}`];
      return compactObject({
        key: slugify(field.label || field.title || field.name) || `custom_field_${id}`,
        id,
        name: cleanString(field.label || field.title || field.name),
        type: field.type || null,
        value: normalizePrimitive(rawValue)
      });
    }).filter(field => field.value !== null && field.value !== '' && !(Array.isArray(field.value) && field.value.length === 0));
  }

  function normalizeConversation(conversation) {
    return (conversation || []).filter(event => {
      const channel = event?.channel?.name;
      return includeInternal.checked || channel !== 'internal';
    }).map(event => compactObject({
      timestamp: event.timestamp || null,
      channel: event?.channel?.name || null,
      author: compactObject({
        id: event?.author?.id ?? null,
        name: cleanString(event?.author?.name),
        role: event?.author?.role || null
      }),
      message: event?.message?.contentType === 'text/html'
        ? stripHtml(event?.message?.content)
        : cleanString(event?.message?.content),
      attachments: (event.attachments || []).map(a => compactObject({
        filename: cleanString(a.filename),
        content_type: a.contentType || null,
        url: a.contentUrl || null
      }))
    }));
  }

  async function normalizeTicket() {
    setStatus('Normalizing ticket…');
    copyButton.disabled = true;

    try {
      const data = await client.get(ticketProperties);
      const customFields = await getCustomFields(property(data, 'ticketFields'));
      const requester = {
        id: property(data, 'ticket.requester.id'),
        name: cleanString(property(data, 'ticket.requester.name'))
      };
      if (includeEmail.checked) requester.email = cleanString(property(data, 'ticket.requester.email'));

      normalizedPayload = compactObject({
        schema_version: '1.0',
        normalized_at: new Date().toISOString(),
        ticket: compactObject({
          id: property(data, 'ticket.id'),
          subject: cleanString(property(data, 'ticket.subject')),
          description: stripHtml(property(data, 'ticket.description')),
          status: property(data, 'ticket.status'),
          priority: property(data, 'ticket.priority'),
          type: property(data, 'ticket.type'),
          tags: [...new Set((property(data, 'ticket.tags') || []).map(t => cleanString(t)).filter(Boolean))].sort(),
          created_at: property(data, 'ticket.createdAt'),
          updated_at: property(data, 'ticket.updatedAt'),
          requester: compactObject(requester),
          assignee: compactObject({
            id: property(data, 'ticket.assignee.user.id'),
            name: cleanString(property(data, 'ticket.assignee.user.name'))
          }),
          group: compactObject({
            id: property(data, 'ticket.assignee.group.id'),
            name: cleanString(property(data, 'ticket.assignee.group.name'))
          }),
          organization: compactObject({
            id: property(data, 'ticket.organization.id'),
            name: cleanString(property(data, 'ticket.organization.name'))
          }),
          brand: compactObject({
            id: property(data, 'ticket.brand.id'),
            name: cleanString(property(data, 'ticket.brand.name'))
          }),
          form: compactObject({
            id: property(data, 'ticket.form.id'),
            name: cleanString(property(data, 'ticket.form.name'))
          }),
          custom_fields: customFields,
          conversation: normalizeConversation(property(data, 'ticket.conversation'))
        })
      });

      output.textContent = JSON.stringify(normalizedPayload, null, 2);
      copyButton.disabled = false;
      setStatus(`Ready · ${normalizedPayload.ticket.conversation?.length || 0} conversation events · ${customFields.length} populated custom fields`);
      await resize();
    } catch (error) {
      console.error(error);
      normalizedPayload = null;
      output.textContent = '';
      setStatus(error?.message || 'Unable to normalize this ticket.', true);
    }
  }

  async function copyJson() {
    if (!normalizedPayload) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(normalizedPayload, null, 2));
      setStatus('Copied normalized JSON to clipboard.');
    } catch (_) {
      setStatus('Clipboard access was blocked by the browser.', true);
    }
  }

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('error', isError);
  }

  async function resize() {
    try {
      await client.invoke('resize', { width: '100%', height: '620px' });
    } catch (_) {}
  }

  refreshButton.addEventListener('click', normalizeTicket);
  copyButton.addEventListener('click', copyJson);
  includeEmail.addEventListener('change', normalizeTicket);
  includeInternal.addEventListener('change', normalizeTicket);

  client.on('app.registered', normalizeTicket);
  client.on('ticket.subject.changed', normalizeTicket);
  client.on('ticket.status.changed', normalizeTicket);
  client.on('ticket.tags.changed', normalizeTicket);
  client.on('ticket.comments.changed', normalizeTicket);
  client.on('ticket.conversation.changed', normalizeTicket);
})();
