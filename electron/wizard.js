  const STRINGS = {
    en: {
      subtitle: 'First-time setup: connect your Discord bot',
      step: 'Step {n} of 3',
      instructions: [
        'Open the Discord Developer Portal and log in.',
        'Click <b>New Application</b>, give it a name (e.g. LiveChat) and create it.',
        'In the left menu, open <b>Bot</b>.',
        'Turn on <b>Message Content Intent</b> (under Privileged Gateway Intents) and save.',
        'Click <b>Reset Token</b>, then <b>Copy</b> the token.'
      ],
      openPortal: 'Open Developer Portal',
      haveToken: 'I have my token',
      tokenLabel: 'Discord Bot Token',
      tokenHint: 'Developer Portal → Your App → Bot → Reset Token',
      tokenPlaceholder: 'Paste your bot token',
      tokenRequired: 'Token is required',
      connect: 'Connect bot',
      connecting: 'Starting server and connecting the bot…',
      connected: 'Connected as {tag}. Now add the bot to your server.',
      tokenError: 'Could not connect the bot: {msg}',
      intentHint: 'Check that Message Content Intent is turned on in the Developer Portal (Bot page), then try again.',
      invite: 'Invite the bot to my server',
      next: 'Next',
      back: 'Back',
      channelLabel: 'Alert channel',
      channelHint: 'The bot reads this channel for media. Greyed-out channels are ones the bot cannot read yet.',
      refresh: 'Refresh',
      pick: 'Pick a channel…',
      noServers: 'The bot is not in any server yet. Invite it, then press Refresh.',
      unreadable: 'unreadable: {missing}',
      perms: { ViewChannel: 'View Channel', ReadMessageHistory: 'Read Message History', SendMessages: 'Send Messages' },
      finish: 'Finish and open dashboard',
      pickRequired: 'Pick a channel first.',
      opening: 'Connected! Opening dashboard…',
      failed: 'Setup failed. Please try again.'
    },
    fr: {
      subtitle: 'Première configuration : connectez votre bot Discord',
      step: 'Étape {n} sur 3',
      instructions: [
        'Ouvrez le Portail Développeur Discord et connectez-vous.',
        'Cliquez sur <b>New Application</b>, donnez-lui un nom (ex. LiveChat) et créez-la.',
        'Dans le menu de gauche, ouvrez <b>Bot</b>.',
        'Activez <b>Message Content Intent</b> (sous Privileged Gateway Intents) et enregistrez.',
        'Cliquez sur <b>Reset Token</b>, puis <b>Copy</b> pour copier le jeton.'
      ],
      openPortal: 'Ouvrir le Portail Développeur',
      haveToken: "J'ai mon jeton",
      tokenLabel: 'Jeton du bot Discord',
      tokenHint: 'Portail Développeur → Votre app → Bot → Reset Token',
      tokenPlaceholder: 'Collez le jeton de votre bot',
      tokenRequired: 'Le jeton est requis',
      connect: 'Connecter le bot',
      connecting: 'Démarrage du serveur et connexion du bot…',
      connected: 'Connecté en tant que {tag}. Ajoutez maintenant le bot à votre serveur.',
      tokenError: 'Impossible de connecter le bot : {msg}',
      intentHint: 'Vérifiez que Message Content Intent est activé dans le Portail Développeur (page Bot), puis réessayez.',
      invite: 'Inviter le bot sur mon serveur',
      next: 'Suivant',
      back: 'Retour',
      channelLabel: 'Salon des alertes',
      channelHint: 'Le bot lit ce salon pour y trouver des médias. Les salons grisés ne sont pas encore lisibles par le bot.',
      refresh: 'Actualiser',
      pick: 'Choisir un salon…',
      noServers: "Le bot n'est dans aucun serveur pour l'instant. Invitez-le, puis cliquez sur Actualiser.",
      unreadable: 'illisible : {missing}',
      perms: { ViewChannel: 'Voir le salon', ReadMessageHistory: 'Voir les anciens messages', SendMessages: 'Envoyer des messages' },
      finish: 'Terminer et ouvrir le tableau de bord',
      pickRequired: "Choisissez d'abord un salon.",
      opening: 'Connecté ! Ouverture du tableau de bord…',
      failed: 'La configuration a échoué. Réessayez.'
    }
  };
  function detectLanguage() {
    try {
      const saved = localStorage.getItem('wizardLanguage');
      if (saved === 'fr' || saved === 'en') return saved;
    } catch { /* storage unavailable: fall back to the system language */ }
    return (navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
  }
  let L = detectLanguage();
  let t = STRINGS[L];

  const $ = (id) => document.getElementById(id);
  const PORTAL_URL = 'https://discord.com/developers/applications';
  let inviteUrl = '';
  let currentStep = 1;
  // The status line and channel list are kept as data so they can be re-rendered in another language.
  let statusText = null; // () => string
  let statusKind = '';
  let channelData = null;

  function renderStatus() {
    $('status').className = 'status' + (statusKind ? ' ' + statusKind : '');
    $('status').textContent = statusText ? statusText() : '';
  }

  function renderChannels() {
    const select = $('channel');
    const selected = select.value;
    select.replaceChildren();
    if (!channelData || !channelData.guilds.length) return;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = t.pick;
    select.appendChild(placeholder);
    for (const g of channelData.guilds) {
      const group = document.createElement('optgroup');
      group.label = g.name;
      for (const c of g.channels) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.disabled = !c.readable;
        const missing = c.missing.map((p) => t.perms[p] || p).join(', ');
        opt.textContent = '#' + c.name + (c.readable ? '' : ' (' + t.unreadable.replace('{missing}', missing) + ')');
        group.appendChild(opt);
      }
      select.appendChild(group);
    }
    select.value = selected;
  }

  function render() {
    t = STRINGS[L];
    document.documentElement.lang = L;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t[el.dataset.i18n]; });
    document.querySelectorAll('[data-lang]').forEach((el) => el.classList.toggle('active', el.dataset.lang === L));
    $('token').placeholder = t.tokenPlaceholder;
    // Static, trusted strings from the table above (never server data), so innerHTML is safe for <b>.
    $('instructions').replaceChildren(...t.instructions.map((html) => {
      const li = document.createElement('li');
      li.innerHTML = html;
      return li;
    }));
    $('steps').textContent = t.step.replace('{n}', currentStep);
    renderChannels();
    renderStatus();
  }

  function setLanguage(lang) {
    L = lang;
    try { localStorage.setItem('wizardLanguage', lang); } catch { /* non-essential */ }
    render();
  }
  document.querySelectorAll('[data-lang]').forEach((el) => { el.onclick = () => setLanguage(el.dataset.lang); });

  // msg is a function so the text can be rebuilt when the language changes.
  function setStatus(msg, kind) {
    statusText = msg || null;
    statusKind = kind || '';
    renderStatus();
  }
  // Strip Electron's IPC error prefix ("Error invoking remote method '…': Error: ")
  function cleanError(e) {
    return ((e && e.message) || '').replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '');
  }

  function showStep(n) {
    document.querySelectorAll('.step').forEach((el) => el.classList.remove('active'));
    $('step' + n).classList.add('active');
    currentStep = n;
    $('steps').textContent = t.step.replace('{n}', n);
    setStatus('');
    if (n === 2) $('token').focus();
  }

  $('portal-btn').onclick = () => window.electronAPI.openExternal(PORTAL_URL);
  $('next1-btn').onclick = () => showStep(2);
  $('back2-btn').onclick = () => showStep(1);
  $('invite-btn').onclick = () => inviteUrl && window.electronAPI.openExternal(inviteUrl);
  $('invite2-btn').onclick = () => inviteUrl && window.electronAPI.openExternal(inviteUrl);
  $('next2-btn').onclick = () => { showStep(3); loadChannels(); };

  async function connect() {
    const btn = $('connect-btn');
    if (btn.disabled) return; // already in flight (Enter key bypasses the button)
    const token = $('token').value.trim();
    $('token').classList.remove('error');
    $('token-err').classList.remove('visible');
    if (!token) {
      $('token').classList.add('error');
      $('token-err').classList.add('visible');
      return;
    }

    btn.disabled = true;
    $('invite-block').classList.add('hidden');
    setStatus(() => t.connecting);
    try {
      const { botTag, inviteUrl: url } = await window.electronAPI.setupToken(token, L);
      inviteUrl = url;
      setStatus(() => t.connected.replace('{tag}', botTag), 'success');
      $('invite-block').classList.remove('hidden');
    } catch (e) {
      // Always add the Message Content Intent hint: it is the most common cause of a failed login.
      const msg = cleanError(e) || '?';
      setStatus(() => t.tokenError.replace('{msg}', msg) + '\n' + t.intentHint, 'error');
    } finally {
      btn.disabled = false;
    }
  }
  $('connect-btn').onclick = connect;

  async function loadChannels() {
    channelData = null;
    renderChannels();
    $('invite2-btn').classList.add('hidden');
    try {
      const data = await window.electronAPI.listChannels();
      inviteUrl = data.inviteUrl || inviteUrl;
      if (!data.guilds.length) {
        setStatus(() => t.noServers, 'error');
        $('invite2-btn').classList.remove('hidden');
        return;
      }
      setStatus('');
      channelData = data;
      renderChannels();
    } catch (e) {
      const msg = cleanError(e);
      setStatus(() => msg || t.failed, 'error');
    }
  }
  $('refresh-btn').onclick = loadChannels;

  async function finish() {
    const btn = $('finish-btn');
    if (btn.disabled) return;
    const channelId = $('channel').value;
    if (!channelId) {
      setStatus(() => t.pickRequired, 'error');
      return;
    }
    btn.disabled = true;
    try {
      await window.electronAPI.setupChannel(channelId, L);
      setStatus(() => t.opening, 'success');
    } catch (e) {
      btn.disabled = false;
      const msg = cleanError(e);
      setStatus(() => msg || t.failed, 'error');
    }
  }
  $('finish-btn').onclick = finish;

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && $('step2').classList.contains('active')) connect();
  });
  render();
  showStep(1);
