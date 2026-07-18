import express from 'express';
import { fetchWebpageContentSafe } from '../services/crawlerService.js';

const router = express.Router();

/**
 * @route  POST /api/crawler/scrape
 * @desc   Securely scrape webpage content guarding against SSRF and content overflows
 * @access Private
 */
router.post('/scrape', async (req, res) => {
  const workspaceId = req.headers['workspace-id'];
  const { url, maxBytes } = req.body;
  
  if (!workspaceId) {
    return res.status(400).json({
      error: 'Multi-tenant isolation violation: Missing workspace-id header.'
    });
  }
  
  if (!url) {
    return res.status(400).json({
      error: 'Missing required parameter: url'
    });
  }
  
  try {
    const data = await fetchWebpageContentSafe(url, 5, maxBytes || 1024 * 1024);
    return res.status(200).json({
      success: true,
      workspaceId,
      data
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
