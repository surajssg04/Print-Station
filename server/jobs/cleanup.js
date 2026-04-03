const cron = require('node-cron');
const fs = require('fs-extra');
const { PrintJob } = require('../models/schemas');

/**
 * Cleanup Logic:
 * - Printed jobs: deleted 1 hour after printing (deleteAfter set by markPrinted())
 * - Unprinted/abandoned jobs: deleted 24 hours after submission
 * Runs every 15 minutes
 */
function startCleanupJob() {
  cron.schedule('*/15 * * * *', async () => {
    console.log('[Cleanup] Running scheduled file cleanup...');
    const now = new Date();

    try {
      // Find all jobs past their deleteAfter timestamp
      const expiredJobs = await PrintJob.find({
        deleteAfter: { $lte: now },
        status: { $in: ['printed', 'pending', 'failed', 'abandoned'] }
      });

      if (expiredJobs.length === 0) {
        console.log('[Cleanup] No expired jobs found.');
        return;
      }

      console.log(`[Cleanup] Found ${expiredJobs.length} expired job(s) to clean up.`);

      for (const job of expiredJobs) {
        // Mark unprinted pending jobs as abandoned
        if (job.status === 'pending' || job.status === 'failed') {
          job.status = 'abandoned';
        }

        // Delete all files for the job
        for (const file of job.files) {
          try {
            await fs.remove(file.filePath);
            console.log(`[Cleanup] Deleted file: ${file.filePath}`);
          } catch (fileErr) {
            console.warn(`[Cleanup] Could not delete file ${file.filePath}:`, fileErr.message);
          }
        }

        // Try to remove the session directory if empty
        if (job.files.length > 0) {
          const sessionDir = require('path').dirname(job.files[0].filePath);
          try {
            const remaining = await fs.readdir(sessionDir);
            if (remaining.length === 0) {
              await fs.rmdir(sessionDir);
            }
          } catch (_) {}
        }

        // Remove job from DB
        await PrintJob.deleteOne({ _id: job._id });
        console.log(`[Cleanup] Removed job ${job.jobId} (status: ${job.status})`);
      }
    } catch (err) {
      console.error('[Cleanup] Error during cleanup:', err);
    }
  });

  console.log('[Cleanup] Scheduled cleanup job started (runs every 15 minutes).');
}

module.exports = { startCleanupJob };