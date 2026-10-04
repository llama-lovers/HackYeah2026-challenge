let creating: Promise<void> | undefined;
export async function ensureOffscreen(): Promise<void> {
  if (creating) return creating;
  creating = (async () => {
    if (!(await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] })).length) {
      await chrome.offscreen.createDocument({ url: 'offscreen/offscreen.html',
        reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.AUDIO_PLAYBACK],
        justification: 'Nagrywanie poleceń i odtwarzanie odpowiedzi głosowych FastEcho' });
    }
  })();
  try { await creating; } finally { creating = undefined; }
}
