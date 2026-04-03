const cron = require('node-cron');
const { PrintJob } = require('../models/schemas');
const cloudinary = require('../config/cloudinary');

function startCleanupJob() {
  cron.schedule('*/15 * * * *', async () => {
    console.log('[Cleanup] Running scheduled cleanup...');
    const now = new Date();

    try {
      const expiredJobs = await PrintJob.find({
        deleteAfter: { $lte: now },
        status: { $in: ['printed', 'pending', 'failed', 'abandoned'] }
      });

      if (expiredJobs.length === 0) {
        console.log('[Cleanup] No expired jobs found.');
        return;
      }

      console.log(`[Cleanup] Found ${expiredJobs.length} expired job(s).`);

      for (const job of expiredJobs) {
        // Delete files from Cloudinary
        for (const file of job.files) {
          if (file.publicId) {
            try {
              const resourceType = file.mimeType === 'application/pdf' ? 'raw' : 'image';
              await cloudinary.uploader.destroy(file.publicId, { resource_type: resourceType });
              console.log(`[Cleanup] Deleted from Cloudinary: ${file.publicId}`);
            } catch (err) {
              console.warn(`[Cleanup] Failed to delete ${file.publicId}:`, err.message);
            }
          }
        }

        // Delete job from DB
        await PrintJob.deleteOne({ _id: job._id });
        console.log(`[Cleanup] Removed job ${job.jobId}`);
      }
    } catch (err) {
      console.error('[Cleanup] Error:', err);
    }
  });

  console.log('[Cleanup] Started (runs every 15 minutes)');
}

module.exports = { startCleanupJob };