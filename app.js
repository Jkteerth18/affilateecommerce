const express = require('express');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const db = require('./db/database');
const adminRoutes = require('./routes/admin');
const viewerRoutes = require('./routes/viewer');

const app = express();
const PORT = process.env.PORT || 10000;

// Set up EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 } // 1 hour
}));

// Make session available to all views
app.use((req, res, next) => {
    res.locals.session = req.session;
    next();
});

// Routes
app.use('/admin', adminRoutes);
app.use('/', viewerRoutes);

// Create uploads directory if it doesn't exist
const fs = require('fs');
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Initialize database and create admin user if not exists
db.initialize();

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});