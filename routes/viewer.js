const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', async (req, res) => {
    try {
        const dresses = await db.getAllDresses();
        res.render('index', { dresses });
    } catch (err) {
        console.error(err);
        res.status(500).send('Database error');
    }
});

module.exports = router;