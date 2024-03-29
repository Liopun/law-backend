const express  = require('express'),
      router   = express.Router(),
      bcrypt   = require('bcrypt'),
      jwt      = require('jsonwebtoken'),
      passport = require('passport'),
      keys     = require('config');

const { check, validationResult } = require('express-validator');

const Auth             = require('../../models/auth-model');

const tokenList = {};
const TOKENLIFE = keys.get('tokenLife'), REFRESHLIFE = keys.get('refreshTokenLife'), SECRET = keys.get('secretOrKey');

// register an admin
router.post('/register', 
    [
        check('name', 'Name is not provided').not().isEmpty(),
        check('email', 'Valid email is not provided').isEmail(),
        check('password', 'Password must be at least 6 characters').isLength({ min: 6})
    ],
    async (req, res) => {

        const errors = validationResult(req);

        if(!errors.isEmpty()) return res.status(400).json({errors: errors.array()});
        
        try {
            const { name, email, password } = req.body;
            let user = await Auth.findOne({ email: email });

            if(user) return res.status(400).json({ errors: [{ msg: 'Email taken' }]});

            const newUser = new Auth({ name, email, password });
            const salt = await bcrypt.genSalt(10);
            const response = {
                success: true,
                message: 'Account created!'
            };

            newUser.password = await bcrypt.hash(password, salt);
            await newUser.save();
            
            res.status(200).json(response);
        } catch (err) {
            console.log("POST /register", err);
            res.status(500).send('Server error');
        }
});

// admin login
router.post('/login', 
    [
        check('email', 'Valid email not provided').isEmail(),
        check('password', 'Password not provided').exists()
    ],
    async (req, res) => {

        const errors = validationResult(req);

        if (!errors.isEmpty()) return res.status(200).json({ errors: errors.array() });

        try {
            const { email, password } = req.body;
            let user = await Auth.findOne({ email: email });
            const isMatch = await bcrypt.compare(password, user.password);

            if (!user) return res.status(400).json({ errors: [{ msg: 'User not found' }]});
            if (!isMatch) return res.status(400).json({errors: [{ msg: 'Invalid Credentials'}]});

            const payload = { id: user.id, name: user.name };
            const cookieOptions = {
                maxAge: TOKENLIFE * 1000,
                httpOnly: true,
                signed: true
            };

            const token = jwt.sign(payload, SECRET, { subject: `${user.id}`, expiresIn: TOKENLIFE });

            const response = {
                success: true,
                message: 'Successfully logged in!'
            };

            tokenList[token] = {
                jwtToken: token,
                id: payload.id,
                name: payload.name
            };

            res.cookie('jwtToken', token, cookieOptions);
            res.status(200).json(response);
        } catch (err) {
            console.log("POST /login", err);
            res.status(500).send('Server error');
        }    
});

// refresh token
router.get('/refresh-token', (req, res) => {
    try {
        const refreshToken = req.signedCookies['jwtToken'];

        if(!(refreshToken && refreshToken in tokenList)) return res.status(404).send('Invalid request');

        const payload = {
            id: tokenList[refreshToken].id,
            name: tokenList[refreshToken].name
        };
        const cookieOptions = {
            maxAge: REFRESHLIFE * 1000,
            httpOnly: true,
            signed: true
        };

        const token = jwt.sign(payload, SECRET, { subject: payload.id, expiresIn: TOKENLIFE });

        const response = {
            success: true,
            message: 'Status: OK'
        };

        tokenList[refreshToken].jwtToken = token;

        res.cookie('jwtToken', token, cookieOptions);
        res.status(200).json(response);
    } catch(err) {
        console.log("GET /refresh-token", err);
        res.status(500).send('Server error');
    }
});

// revoke token
router.get('/revoke-token', (req, res) => {
    try {
        const token = req.signedCookies['jwtToken'];
        if (token in tokenList) delete tokenList[token];
        res.clearCookie();
        res.status(204).send('out');
    } catch(err) {
        console.log("GET /revoke-token", err);
        res.status(500).send('Server error');
    }
});

module.exports = router;