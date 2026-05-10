// bot/services/gasClient.js
// GAS（Google Apps Script）との HTTP 通信を担当するサービス層

// fetchEventsFromGAS   : userId を指定してイベント一覧を GET
// postAttendanceToGAS  : ⭕ リアクション時に出席を登録（POST）
// deleteAttendanceFromGAS : ❌ リアクション時に出席を削除（POST + action: 'delete'）

const GAS_URL = process.env.GAS_URL || '';

async function fetchEventsFromGAS(userId) {
  if (!GAS_URL) throw new Error('GAS_URL が設定されていません (.env に GAS_URL=... を追加してください)');

  const url = `${GAS_URL}?userId=${encodeURIComponent(userId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GAS レスポンスエラー: ${res.status}`);

  const json = await res.json();
  if (json.error) throw new Error(json.error);

  return json.events || [];
}

async function postAttendanceToGAS({ userTag, userId, eventInfo, eventDay, eventTime }) {
  if (!GAS_URL) throw new Error('GAS_URL が設定されていません (.env に GAS_URL=... を追加してください)');

  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userTag, userId, eventInfo, eventDay, eventTime }),
  });

  if (!res.ok) throw new Error(`GAS レスポンスエラー: ${res.status}`);
  return await res.json();
}

module.exports = { fetchEventsFromGAS, postAttendanceToGAS };