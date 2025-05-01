const express = require('express');
const c = require('../controllers/robotController');
const mapRt = require('./robotMapRoutes');
const router = express.Router();

router.get('/', c.getAll);
router.get('/:id', c.getById);
router.post('/', c.create);
router.put('/:id', c.update);
router.delete('/', c.removeAll);
router.delete('/:id', c.remove);
router.post('/:id/move', c.moveToStation);
router.use('/:id', mapRt);


module.exports = router;
