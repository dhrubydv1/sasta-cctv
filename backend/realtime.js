const Ably = require('ably');
const crypto = require('crypto');

function client() {
  if (!process.env.ABLY_API_KEY) throw new Error('ABLY_API_KEY is not configured');
  return new Ably.Rest(process.env.ABLY_API_KEY);
}

function channelName(userId) {
  return `cctv:${userId}:events`;
}

async function createTokenRequest(userId) {
  const clientId = `u:${userId}:${crypto.randomUUID()}`;
  return client().auth.createTokenRequest({
    clientId,
    ttl: 60 * 60 * 1000,
    capability: { [channelName(userId)]: ['publish', 'subscribe', 'presence'] }
  });
}

async function publishMotionAlert(userId, alert) {
  await client().channels.get(channelName(userId)).publish('motion-alert', alert);
}

async function getActiveCameras(userId) {
  const members = await client().channels.get(channelName(userId)).presence.get();
  const seen = new Set();
  return members.filter(member => member.data && member.data.type === 'camera' && !seen.has(member.clientId) && seen.add(member.clientId))
    .map(member => ({ socketId: member.clientId, cameraName: member.data.cameraName || 'Unknown Camera' }));
}

module.exports = { createTokenRequest, publishMotionAlert, getActiveCameras };
