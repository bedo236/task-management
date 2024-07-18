const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');

const app = express();
const SECRET_KEY = process.env.SECRET_KEY || 'secret_key';
const PORT = process.env.PORT || 3000;


app.use(cors());
app.use(bodyParser.json());

const db = new sqlite3.Database('./tasks.db', (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('Connected to the tasks database.');
    }
});

db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    date TEXT NOT NULL,
    teacher_id INTEGER NOT NULL,
    FOREIGN KEY (teacher_id) REFERENCES users(id)
)`);

app.post('/api/register', (req, res) => {
    const { username, password, role } = req.body;

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            console.error('Error hashing password:', err);
            return res.status(500).json({ message: 'Error hashing password' });
        }

        const stmt = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)');
        stmt.run(username, hash, role, function (err) {
            if (err) {
                console.error('Error registering user:', err);
                return res.status(400).json({ message: 'Error registering user' });
            }

            const token = jwt.sign({ id: this.lastID, role: role }, SECRET_KEY);
            res.status(201).json({ message: 'User registered successfully', token: token });
        });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password, role } = req.body;

    const stmt = db.prepare('SELECT * FROM users WHERE username = ? AND role = ?');
    stmt.get(username, role, (err, user) => {
        if (err) {
            console.error('Error fetching user:', err);
            return res.status(500).json({ message: 'Error fetching user' });
        }

        if (!user) {
            return res.status(400).json({ message: 'Invalid username or role' });
        }

        bcrypt.compare(password, user.password, (err, result) => {
            if (err) {
                console.error('Error comparing passwords:', err);
                return res.status(500).json({ message: 'Error comparing passwords' });
            }

            if (!result) {
                return res.status(400).json({ message: 'Invalid password' });
            }

            const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY);
            res.status(200).json({ message: 'User logged in successfully', token: token, role: user.role });
        });
    });
});


function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) {
        console.log('No token provided');
        return res.sendStatus(401); 
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            console.error('Token verification failed:', err);
            if (err.name === 'JsonWebTokenError') {
                return res.status(401).send('Invalid token'); 
            }
            return res.sendStatus(403); 
        }

        req.user = user; 
        next(); 
    });
}

app.get('/api/tasks', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const userRole = req.user.role;

    let query;
    let params = [];
    if (userRole === 'admin') {
        query = 'SELECT * FROM tasks';
    } else {
        query = 'SELECT * FROM tasks WHERE teacher_id = ?';
        params = [userId];
    }

    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ message: 'Error fetching tasks' });
        }

        res.json(rows);
    });
});

app.post('/api/tasks', authenticateToken, (req, res) => {
    const { description, date, teacherId } = req.body;

    const stmt = db.prepare('INSERT INTO tasks (description, date, teacher_id) VALUES (?, ?, ?)');
    stmt.run(description, date, teacherId, function (err) {
        if (err) {
            console.error('Error creating task:', err);
            return res.status(400).json({ message: 'Error creating task' });
        }

        res.status(201).json({ message: 'Task added successfully', taskId: this.lastID });
    });
});

app.get('/api/teachers', authenticateToken, (req, res) => {
    db.all('SELECT id, username FROM users WHERE role = "teacher"', (err, rows) => {
        if (err) {
            console.error('Error fetching teachers:', err);
            return res.status(500).json({ message: 'Error fetching teachers' });
        }

        res.json(rows);
    });
});


app.use((err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {
        res.status(401).send('Invalid token...');
    } else if (err.name === 'JsonWebTokenError') {
        res.status(401).send('Invalid token...');
    } else if (err.name === 'TokenExpiredError') {
        res.status(401).send('Token expired...');
    } else {
        console.error('Internal Server Error:', err);
        res.status(500).send('Something went wrong...');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
