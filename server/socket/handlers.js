const { PrinterSession } = require('../models/schemas');

/**
 * Socket.IO Event Flow:
 *
 * PC Dashboard:
 *   EMIT  → join_session  { sessionId }   → joins room "session:{sessionId}"
 *   ON    ← new_job       { job details } → receives new print job
 *   ON    ← job_status_update             → receives status changes
 *
 * Mobile (Student):
 *   (No persistent socket needed — REST API is sufficient for uploads)
 *   OPTIONAL: EMIT → job_submitted { sessionId, jobId } for confirmation
 */
function setupSocketIO(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // ── PC Dashboard joins its session room ──────────────────────────────────
    socket.on('join_session', async ({ sessionId }) => {
      if (!sessionId) return;

      // Leave any previous session rooms
      const rooms = [...socket.rooms].filter(r => r.startsWith('session:'));
      for (const room of rooms) socket.leave(room);

      socket.join(`session:${sessionId}`);
      console.log(`[Socket] Dashboard ${socket.id} joined session: ${sessionId}`);

      // Update session with connected socket
      try {
        await PrinterSession.updateOne(
          { sessionId },
          { connectedSocketId: socket.id, lastActiveAt: new Date(), status: 'active' }
        );
      } catch (err) {
        console.error('[Socket] Error updating session:', err);
      }

      socket.emit('session_joined', { sessionId, socketId: socket.id });
    });

    // ── Dashboard acknowledges a job (e.g. starts printing) ──────────────────
    socket.on('ack_job', ({ jobId, sessionId }) => {
      console.log(`[Socket] Job ${jobId} acknowledged by dashboard`);
      io.to(`session:${sessionId}`).emit('job_ack', { jobId });
    });

    // ── Heartbeat to keep session alive ──────────────────────────────────────
    socket.on('heartbeat', async ({ sessionId }) => {
      if (sessionId) {
        await PrinterSession.updateOne({ sessionId }, { lastActiveAt: new Date() }).catch(() => {});
      }
      socket.emit('heartbeat_ack');
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
      // Mark session as inactive if this socket was the dashboard
      try {
        await PrinterSession.updateOne(
          { connectedSocketId: socket.id },
          { connectedSocketId: null }
        );
      } catch (err) {
        console.error('[Socket] Error on disconnect cleanup:', err);
      }
    });
  });
}

module.exports = { setupSocketIO };