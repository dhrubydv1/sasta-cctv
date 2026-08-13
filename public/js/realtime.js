// Socket.IO-compatible signalling adapter backed by Ably. The browser never
// receives the Ably API key; it receives a short-lived, account-scoped token.
(() => {
  window.io = () => {
    const handlers = new Map();
    let realtime;
    let channel;
    let device = null;
    const socket = {
      id: null,
      on(event, handler) {
        handlers.set(event, [...(handlers.get(event) || []), handler]);
        return socket;
      },
      emit(event, payload = {}) {
        if (!channel) return;
        if (event === 'register-device') {
          device = {
            type: payload.type,
            cameraName: typeof payload.cameraName === 'string' ? payload.cameraName.slice(0, 64) : 'Unknown Camera'
          };
          channel.presence.enter(device).catch(console.error);
          return;
        }
        if (event === 'webrtc-signal' || event === 'trigger-siren') {
          channel.publish(event, { ...payload, senderSocketId: socket.id }).catch(console.error);
        }
      },
      disconnect() {
        if (channel && device) channel.presence.leave().catch(() => {});
        if (realtime) realtime.close();
      }
    };
    const trigger = (event, data) => (handlers.get(event) || []).forEach(handler => handler(data));
    const cameras = async () => {
      const members = await channel.presence.get();
      const unique = new Map();
      members.filter(member => member.data && member.data.type === 'camera').forEach(member => {
        unique.set(member.clientId, { socketId: member.clientId, cameraName: member.data.cameraName || 'Unknown Camera' });
      });
      trigger('camera-list-update', [...unique.values()]);
    };

    if (!window.Ably || !window.CCTV_USER_ID) {
      queueMicrotask(() => trigger('app-error', 'Realtime configuration is unavailable'));
      return socket;
    }
    realtime = new Ably.Realtime({ authUrl: '/api/realtime-token', authMethod: 'GET' });
    realtime.connection.once('connected', () => {
      socket.id = realtime.auth.clientId;
      channel = realtime.channels.get(`cctv:${window.CCTV_USER_ID}:events`);
      channel.subscribe('webrtc-signal', message => {
        const data = message.data || {};
        if (data.targetSocketId === socket.id) trigger('webrtc-signal', data);
      });
      channel.subscribe('trigger-siren', message => {
        const data = message.data || {};
        if (data.targetSocketId === socket.id) trigger('trigger-siren', data);
      });
      channel.subscribe('motion-alert', message => trigger('motion-alert', message.data));
      channel.presence.subscribe(() => cameras().catch(console.error));
      cameras().catch(console.error);
      trigger('connect');
    });
    realtime.connection.on('failed', () => trigger('app-error', 'Realtime connection failed'));
    return socket;
  };
})();
