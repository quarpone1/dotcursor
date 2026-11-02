// Телефон берём только из профиля, подтверждённого подписанным контактом MAX.
// Без него сохраняем доступные сведения аккаунта — телефон API не раскрывает.
export function accountContact(user = {}, verifiedProfile = null) {
  const username = typeof user.username === 'string' ? user.username.replace(/^@/, '') : '';
  const name = String(user.name || '').trim();
  const id = user.id == null ? null : String(user.id);
  const identity = username ? `@${username}` : name;
  const max = `MAX: ${identity || 'пользователь'}${id ? ` (ID: ${id})` : ''}`;
  return verifiedProfile?.phone ? `Телефон: +${verifiedProfile.phone} · ${max}` : max;
}
