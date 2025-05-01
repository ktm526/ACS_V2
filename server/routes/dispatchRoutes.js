const router = require('express').Router();
const dispatcher = require('../services/dispatcherService');

router.post('/', dispatcher.handleRequest);   //  POST /api/dispatch

module.exports = router;
