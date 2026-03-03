const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const multer = require('multer');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const http = require('http');
const socketIO = require('socket.io');

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, './')));
app.use('/uploads', express.static('uploads'));

// Create uploads directory
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
    fs.mkdirSync('uploads/profile');
    fs.mkdirSync('uploads/documents');
    fs.mkdirSync('uploads/messages');
    fs.mkdirSync('uploads/products');
    fs.mkdirSync('uploads/screenshots');
    fs.mkdirSync('uploads/icards');
}

// Session Configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected Successfully'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// ==================== MODELS ====================

const userSchema = new mongoose.Schema({
    userId: { type: String, unique: true, required: true },
    sponsorId: { type: String, required: true },
    name: { type: String, required: true },
    mobile: { type: String, unique: true, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    position: { type: String, enum: ['left', 'right'], required: true },
    role: { type: String, default: 'user' },
    status: { type: String, enum: ['active', 'inactive'], default: 'inactive' },
    franchiseStage: { 
        type: String, 
        enum: ['general', 'micro', 'mini', 'max'], 
        default: 'general' 
    },
    joinDate: { type: Date, default: Date.now },
    activationDate: Date,
    expiryDate: Date,
    wallet: { type: Number, default: 0 },
    wallet12Month: { type: Number, default: 0 },
    monthlyFunds: [{
        month: Number,
        year: Number,
        amount: Number,
        date: Date,
        status: { type: String, enum: ['locked', 'unlocked'], default: 'locked' }
    }],
    directCount: { type: Number, default: 0 },
    activeDirect: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    leftChild: String,
    rightChild: String,
    leftCount: { type: Number, default: 0 },
    rightCount: { type: Number, default: 0 },
    totalPurchase: { type: Number, default: 0 },
    totalPurchaseCount: { type: Number, default: 0 },
    totalIncome: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
    profilePic: String,
    dob: Date,
    anniversary: Date,
    address: {
        street: String,
        city: String,
        state: String,
        pincode: String,
        country: { type: String, default: 'India' }
    },
    bankDetails: {
        accountName: String,
        accountNumber: String,
        bankName: String,
        ifsc: String,
        branch: String
    },
    documents: {
        aadharFront: String,
        aadharBack: String,
        panCard: String
    },
    pinCode: String,
    isFranchise: { type: Boolean, default: false },
    franchiseDetails: {
        bulkPurchase: { type: Number, default: 0 },
        totalDelivery: { type: Number, default: 0 },
        pendingDelivery: { type: Number, default: 0 },
        stage: { type: String, default: 'micro' },
        joinDate: Date,
        lastBulkPurchase: Date,
        pinCodes: [String]
    },
    rewards: [{
        rewardId: String,
        achievedDate: Date
    }]
});

const productSchema = new mongoose.Schema({
    productId: { type: String, unique: true },
    name: String,
    category: String,
    subCategory: String,
    description: String,
    images: [String],
    weight: Number,
    purity: String,
    makingCharge: Number,
    packingCharge: Number,
    deliveryCharge: Number,
    gst: Number,
    price: Number,
    bv: Number,
    dp: Number,
    stock: Number,
    status: { type: String, default: 'active' },
    createdAt: { type: Date, default: Date.now }
});

const categorySchema = new mongoose.Schema({
    name: { type: String, unique: true },
    purchaseRate: Number,
    expense: Number,
    making: Number,
    packing: Number,
    deliveryCharge: Number,
    gst: Number,
    status: { type: String, default: 'active' },
    createdAt: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true },
    userId: String,
    products: [{
        productId: String,
        name: String,
        quantity: Number,
        price: Number,
        bv: Number,
        dp: Number,
        making: Number,
        packing: Number,
        deliveryCharge: Number,
        gst: Number,
        weight: Number
    }],
    totalAmount: Number,
    totalBV: Number,
    totalDP: Number,
    orderDate: { type: Date, default: Date.now },
    status: { 
        type: String, 
        enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    paymentMethod: String,
    paymentStatus: { 
        type: String, 
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    deliveryStatus: { 
        type: String, 
        enum: ['pending', 'assigned', 'delivered'],
        default: 'pending'
    },
    deliveredBy: String,
    deliveryDate: Date,
    deliveryAddress: {
        street: String,
        city: String,
        state: String,
        pincode: String,
        phone: String
    },
    invoiceNo: String,
    isFirstPurchase: { type: Boolean, default: false }
});

const incomeSchema = new mongoose.Schema({
    userId: String,
    fromUserId: String,
    orderId: String,
    type: { 
        type: String, 
        enum: ['direct', 'level', 'matching', 'delivery', 'royalty', 'making', 'packing'] 
    },
    level: Number,
    amount: Number,
    status: { type: String, enum: ['credited', 'lapsed'], default: 'credited' },
    date: { type: Date, default: Date.now }
});

const withdrawalSchema = new mongoose.Schema({
    withdrawalId: { type: String, unique: true },
    userId: String,
    amount: Number,
    tds: Number,
    adminCharge: Number,
    netAmount: Number,
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected', 'processed'],
        default: 'pending'
    },
    requestDate: { type: Date, default: Date.now },
    processDate: Date,
    paymentMethod: String,
    transactionId: String,
    remarks: String
});

const messageSchema = new mongoose.Schema({
    fromUserId: String,
    toUserId: String,
    message: String,
    type: { type: String, enum: ['text', 'image', 'audio'] },
    fileUrl: String,
    read: { type: Boolean, default: false },
    readAt: Date,
    timestamp: { type: Date, default: Date.now }
});

const settingsSchema = new mongoose.Schema({
    type: String,
    values: Object,
    updatedAt: { type: Date, default: Date.now },
    updatedBy: String
});

const fundRequestSchema = new mongoose.Schema({
    requestId: { type: String, unique: true },
    userId: String,
    amount: Number,
    paymentMethod: String,
    utrNumber: String,
    screenshot: String,
    remarks: String,
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    requestDate: { type: Date, default: Date.now },
    processDate: Date,
    processedBy: String
});

const activationRequestSchema = new mongoose.Schema({
    requestId: { type: String, unique: true },
    userId: String,
    amount: Number,
    paymentMethod: String,
    utrNumber: String,
    screenshot: String,
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    requestDate: { type: Date, default: Date.now },
    processDate: Date,
    processedBy: String
});

const rewardSchema = new mongoose.Schema({
    rewardId: { type: String, unique: true },
    name: String,
    minPurchase: Number,
    image: String,
    description: String,
    status: { type: String, default: 'active' },
    createdAt: { type: Date, default: Date.now }
});

const awardSchema = new mongoose.Schema({
    awardId: { type: String, unique: true },
    userId: String,
    rewardId: String,
    achievedDate: Date,
    status: { type: String, default: 'pending' }
});

const deliverySchema = new mongoose.Schema({
    deliveryId: { type: String, unique: true },
    orderId: String,
    franchiseId: String,
    customerId: String,
    products: [{
        productId: String,
        name: String,
        quantity: Number
    }],
    deliveryDate: Date,
    otp: String,
    otpVerified: { type: Boolean, default: false },
    status: { 
        type: String, 
        enum: ['assigned', 'in_transit', 'delivered', 'failed'],
        default: 'assigned'
    },
    deliveryCharge: Number,
    commission: Number,
    customerRating: Number,
    feedback: String
});

// Create Models
const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);
const Category = mongoose.model('Category', categorySchema);
const Order = mongoose.model('Order', orderSchema);
const Income = mongoose.model('Income', incomeSchema);
const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
const Message = mongoose.model('Message', messageSchema);
const Settings = mongoose.model('Settings', settingsSchema);
const FundRequest = mongoose.model('FundRequest', fundRequestSchema);
const ActivationRequest = mongoose.model('ActivationRequest', activationRequestSchema);
const Reward = mongoose.model('Reward', rewardSchema);
const Award = mongoose.model('Award', awardSchema);
const Delivery = mongoose.model('Delivery', deliverySchema);

// ==================== EMAIL CONFIG ====================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS.replace(/ /g, '')
    }
});

// ==================== MULTER CONFIG ====================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadPath = 'uploads/';
        if (req.path.includes('profile')) {
            uploadPath += 'profile/';
        } else if (req.path.includes('document')) {
            uploadPath += 'documents/';
        } else if (req.path.includes('message')) {
            uploadPath += 'messages/';
        } else if (req.path.includes('product')) {
            uploadPath += 'products/';
        } else if (req.path.includes('screenshot')) {
            uploadPath += 'screenshots/';
        } else if (req.path.includes('icard')) {
            uploadPath += 'icards/';
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'));
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'));
        }
    }
});

// ==================== SOCKET.IO for Messaging ====================
io.on('connection', (socket) => {
    console.log('New client connected');
    
    socket.on('join', (userId) => {
        socket.join(userId);
    });
    
    socket.on('sendMessage', async (data) => {
        try {
            const message = await Message.create({
                fromUserId: data.fromUserId,
                toUserId: data.toUserId,
                message: data.message,
                type: data.type || 'text',
                fileUrl: data.fileUrl
            });
            
            io.to(data.toUserId).emit('newMessage', message);
            socket.emit('messageSent', message);
        } catch (error) {
            console.error('Socket message error:', error);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// ==================== HELPER FUNCTIONS ====================

function generateUserId() {
    return 'LIRA' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 100);
}

function generateOrderId() {
    return 'ORD' + Date.now() + Math.floor(Math.random() * 1000);
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendEmail(to, subject, html) {
    try {
        await transporter.sendMail({
            from: `"LIRA MLM" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html
        });
        return true;
    } catch (error) {
        console.error('Email error:', error);
        return false;
    }
}

// Binary Tree Placement Function
async function findPosition(sponsorId, position) {
    const sponsor = await User.findOne({ userId: sponsorId });
    if (!sponsor) return null;
    
    // Check if position is available at sponsor level
    if (position === 'left' && !sponsor.leftChild) {
        return { parentId: sponsorId, position: 'left' };
    }
    if (position === 'right' && !sponsor.rightChild) {
        return { parentId: sponsorId, position: 'right' };
    }
    
    // Auto-fill logic - find next available position
    const queue = [sponsorId];
    while (queue.length > 0) {
        const currentId = queue.shift();
        const current = await User.findOne({ userId: currentId });
        
        if (position === 'left' && !current.leftChild) {
            return { parentId: current.userId, position: 'left' };
        }
        if (position === 'right' && !current.rightChild) {
            return { parentId: current.userId, position: 'right' };
        }
        
        if (current.leftChild) queue.push(current.leftChild);
        if (current.rightChild) queue.push(current.rightChild);
    }
    
    return null;
}

// Update User Level Based on Active Directs
async function updateUserLevel(userId) {
    const user = await User.findOne({ userId });
    if (!user) return;
    
    // Count active directs
    const activeDirects = await User.countDocuments({ 
        sponsorId: userId, 
        status: 'active',
        expiryDate: { $gt: new Date() }
    });
    
    // Get level settings
    const levelSettings = await Settings.findOne({ type: 'levelSettings' });
    if (!levelSettings) return;
    
    let newLevel = 5; // Base level
    
    // Check level unlock requirements
    const requirements = levelSettings.values.levelRequirements || [
        { level: 6, directs: 11 },
        { level: 7, directs: 12 },
        { level: 8, directs: 13 },
        { level: 9, directs: 14 },
        { level: 10, directs: 15 }
    ];
    
    for (let req of requirements) {
        if (activeDirects >= req.directs) {
            newLevel = req.level;
        } else {
            break;
        }
    }
    
    user.level = newLevel;
    user.activeDirect = activeDirects;
    await user.save();
    
    return newLevel;
}

// Distribute Income
async function distributeIncome(orderId, userId, amount, type, metadata = {}) {
    const order = await Order.findOne({ orderId });
    if (!order) return;
    
    const user = await User.findOne({ userId });
    if (!user) return;
    
    // Get income settings
    const incomeSettings = await Settings.findOne({ type: 'incomeSettings' });
    if (!incomeSettings) return;
    
    const levelPercentages = incomeSettings.values.levelIncome || [10, 5, 3, 2, 1, 0.5, 0.3, 0.2, 0.1, 0.05];
    
    // Distribute to uplines
    let currentUserId = user.sponsorId;
    let level = 1;
    
    while (currentUserId && level <= user.level) {
        const upline = await User.findOne({ userId: currentUserId });
        if (!upline) break;
        
        // Check if upline is active
        const isActive = upline.status === 'active' && 
                        upline.expiryDate && 
                        upline.expiryDate > new Date();
        
        const levelPercent = levelPercentages[level - 1] || 0;
        const levelIncome = (amount * levelPercent) / 100;
        
        if (isActive && levelIncome > 0) {
            // Credit income
            await Income.create({
                userId: upline.userId,
                fromUserId: userId,
                orderId,
                type: type === 'delivery' ? 'delivery' : 'level',
                level,
                amount: levelIncome,
                status: 'credited'
            });
            
            upline.wallet += levelIncome;
            upline.totalIncome += levelIncome;
            await upline.save();
            
            // Send email notification
            await sendEmail(
                upline.email,
                'Income Credited - LIRA',
                generateIncomeEmail(upline.name, levelIncome, level)
            );
        } else {
            // Lapsed income
            await Income.create({
                userId: upline.userId,
                fromUserId: userId,
                orderId,
                type: type === 'delivery' ? 'delivery' : 'level',
                level,
                amount: levelIncome,
                status: 'lapsed'
            });
        }
        
        currentUserId = upline.sponsorId;
        level++;
    }
}

// Generate I-Card PDF
async function generateICard(userId) {
    const user = await User.findOne({ userId });
    if (!user) return null;
    
    const doc = new PDFDocument();
    const filePath = `uploads/icards/${userId}.pdf`;
    const stream = fs.createWriteStream(filePath);
    
    doc.pipe(stream);
    
    // Design I-Card
    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f0f0f0');
    
    // Header
    doc.fillColor('#333')
       .fontSize(20)
       .text('LIRA MLM', 50, 50)
       .fontSize(12)
       .text('Member Identification Card', 50, 80);
    
    // Photo
    if (user.profilePic) {
        doc.image(user.profilePic, 50, 120, { width: 100 });
    } else {
        doc.rect(50, 120, 100, 100).stroke()
           .fillColor('#999')
           .fontSize(10)
           .text('No Photo', 70, 170);
    }
    
    // Details
    doc.fillColor('#000')
       .fontSize(12)
       .text(`Name: ${user.name}`, 170, 120)
       .text(`User ID: ${user.userId}`, 170, 140)
       .text(`Designation: ${user.franchiseStage}`, 170, 160)
       .text(`Mobile: ${user.mobile}`, 170, 180)
       .text(`Email: ${user.email}`, 170, 200);
    
    if (user.address) {
        doc.text(`Address: ${user.address.street}, ${user.address.city}`, 170, 220)
           .text(`${user.address.state} - ${user.address.pincode}`, 170, 240);
    }
    
    // QR Code
    const qrData = JSON.stringify({
        userId: user.userId,
        name: user.name,
        mobile: user.mobile
    });
    
    QRCode.toDataURL(qrData, (err, url) => {
        if (!err) {
            doc.image(url, 400, 350, { width: 100 });
        }
    });
    
    // Footer
    doc.fontSize(8)
       .fillColor('#666')
       .text('This is a digitally generated ID card', 50, 550)
       .text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 565);
    
    doc.end();
    
    return new Promise((resolve) => {
        stream.on('finish', () => resolve(filePath));
    });
}

// Email Templates
function generateWelcomeEmail(name, userId, mobile) {
    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px;">
            <div style="background: white; padding: 30px; border-radius: 10px;">
                <h1 style="color: #333; text-align: center;">Welcome to LIRA!</h1>
                <p style="font-size: 16px; color: #666;">Dear ${name},</p>
                <p style="font-size: 16px; color: #666;">Thank you for joining LIRA MLM E-commerce platform. Your account has been successfully created.</p>
                
                <div style="background: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
                    <h3 style="color: #333;">Your Login Credentials:</h3>
                    <p><strong>User ID:</strong> ${userId}</p>
                    <p><strong>Password:</strong> ${mobile}</p>
                </div>
                
                <p style="color: #666;">Please login and change your password for security.</p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.BASE_URL}/user-login.html" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">Login Now</a>
                </div>
                
                <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message, please do not reply.</p>
            </div>
        </div>
    `;
}

function generateIncomeEmail(name, amount, level) {
    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #43cea2 0%, #185a9d 100%); border-radius: 10px;">
            <div style="background: white; padding: 30px; border-radius: 10px;">
                <h1 style="color: #333; text-align: center;">Income Credited! 🎉</h1>
                <p style="font-size: 16px; color: #666;">Dear ${name},</p>
                
                <div style="background: #e8f5e9; padding: 20px; border-radius: 5px; margin: 20px 0;">
                    <h2 style="color: #2e7d32; text-align: center; font-size: 32px;">₹${amount.toFixed(2)}</h2>
                    <p style="text-align: center; color: #666;">Level ${level} Income</p>
                </div>
                
                <p style="color: #666;">This amount has been credited to your wallet.</p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.BASE_URL}/income-history.html" style="background: #43cea2; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">View Income History</a>
                </div>
            </div>
        </div>
    `;
}

function generateFundCreditEmail(name, amount, balance) {
    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 10px;">
            <div style="background: white; padding: 30px; border-radius: 10px;">
                <h1 style="color: #333; text-align: center;">Fund Credited! 💰</h1>
                <p style="font-size: 16px; color: #666;">Dear ${name},</p>
                
                <div style="background: #fff3e0; padding: 20px; border-radius: 5px; margin: 20px 0;">
                    <p><strong>Amount Credited:</strong> ₹${amount}</p>
                    <p><strong>Current Wallet Balance:</strong> ₹${balance}</p>
                </div>
                
                <p style="color: #666;">You can now use this amount to purchase products.</p>
            </div>
        </div>
    `;
}

function generateOrderConfirmationEmail(name, orderId, amount, items) {
    let itemsHtml = '';
    items.forEach(item => {
        itemsHtml += `<tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${item.name}</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${item.quantity}</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">₹${item.price}</td>
        </tr>`;
    });
    
    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #333;">Order Confirmed! 🛍️</h1>
            <p>Dear ${name},</p>
            <p>Your order has been confirmed successfully.</p>
            
            <div style="background: #f5f5f5; padding: 20px; border-radius: 5px;">
                <h3>Order Details:</h3>
                <p><strong>Order ID:</strong> ${orderId}</p>
                <p><strong>Total Amount:</strong> ₹${amount}</p>
                
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="padding: 10px; background: #333; color: white;">Product</th>
                            <th style="padding: 10px; background: #333; color: white;">Qty</th>
                            <th style="padding: 10px; background: #333; color: white;">Price</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>
            </div>
            
            <p>We'll notify you when your order is shipped.</p>
        </div>
    `;
}

function generateBirthdayEmail(name) {
    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%); border-radius: 10px;">
            <div style="background: white; padding: 30px; border-radius: 10px; text-align: center;">
                <h1 style="color: #ff6b6b; font-size: 48px;">🎂 Happy Birthday!</h1>
                <p style="font-size: 24px; color: #333;">Dear ${name},</p>
                <p style="font-size: 18px; color: #666;">Wishing you a fantastic birthday filled with joy and success!</p>
                
                <div style="margin: 30px 0;">
                    <img src="https://media.giphy.com/media/l4FGI8iNQMWoiVWbm/giphy.gif" alt="Birthday" style="max-width: 100%; border-radius: 10px;">
                </div>
                
                <p style="color: #999;">May your year ahead be as bright as your smile!</p>
                <p style="color: #666;">- Team LIRA</p>
            </div>
        </div>
    `;
}

// ==================== API ROUTES ====================

// ==================== USER ROUTES ====================

// ✅ FIXED: Register with PLAIN TEXT password
app.post('/api/register', async (req, res) => {
    try {
        const { sponsorId, name, mobile, email, position } = req.body;
        
        // Validation
        if (!sponsorId || !name || !mobile || !email || !position) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        // Check if user exists
        const existingUser = await User.findOne({ $or: [{ mobile }, { email }] });
        if (existingUser) {
            return res.status(400).json({ error: 'Mobile or Email already registered' });
        }
        
        // Check sponsor
        const sponsor = await User.findOne({ userId: sponsorId });
        if (!sponsor) {
            return res.status(400).json({ error: 'Invalid Sponsor ID' });
        }
        
        // Find position in binary tree
        const positionData = await findPosition(sponsorId, position);
        if (!positionData) {
            return res.status(400).json({ error: 'No position available in the selected leg' });
        }
        
        // Generate user ID
        const userId = generateUserId();
        
        // 🔑 PLAIN TEXT PASSWORD (mobile number as password)
        const plainPassword = mobile;
        
        // Create user with plain text password
        const user = await User.create({
            userId,
            sponsorId,
            name,
            mobile,
            email,
            password: plainPassword, // ← PLAIN TEXT
            position,
            joinDate: new Date(),
            expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        });
        
        // Update parent's child
        if (positionData.position === 'left') {
            await User.findOneAndUpdate(
                { userId: positionData.parentId },
                { leftChild: userId, $inc: { leftCount: 1 } }
            );
        } else {
            await User.findOneAndUpdate(
                { userId: positionData.parentId },
                { rightChild: userId, $inc: { rightCount: 1 } }
            );
        }
        
        // Update sponsor's direct count
        sponsor.directCount += 1;
        await sponsor.save();
        
        // Update sponsor's level
        await updateUserLevel(sponsorId);
        
        // Send welcome email
        await sendEmail(email, 'Welcome to LIRA Family!', generateWelcomeEmail(name, userId, mobile));
        
        res.json({ 
            success: true, 
            message: 'Registration successful',
            userId: userId,
            password: mobile
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed: ' + error.message });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { userId, password } = req.body;
        
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(400).json({ error: 'Invalid User ID' });
        }
        
        // Direct string comparison for plain text
        if (password !== user.password) {
            return res.status(400).json({ error: 'Invalid Password' });
        }
        
        // Check if password needs change (if still mobile number)
        const isDefaultPassword = (password === user.mobile);
        
        // Create session
        req.session.userId = user.userId;
        req.session.role = user.role;
        
        res.json({
            success: true,
            role: user.role,
            userId: user.userId,
            name: user.name,
            franchiseStage: user.franchiseStage,
            wallet: user.wallet,
            wallet12Month: user.wallet12Month,
            isActive: user.status === 'active',
            needsPasswordChange: isDefaultPassword
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Logged out successfully' });
});

// Check Session
app.get('/api/session', (req, res) => {
    if (req.session.userId) {
        res.json({ 
            loggedIn: true, 
            userId: req.session.userId,
            role: req.session.role 
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// Forgot ID
app.post('/api/forgot-id', async (req, res) => {
    try {
        const { email } = req.body;
        
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Email not found' });
        }
        
        await sendEmail(
            email, 
            'Your LIRA User ID',
            `
                <div style="font-family: Arial, sans-serif;">
                    <h2>Your User ID</h2>
                    <p>Dear ${user.name},</p>
                    <p>Your User ID is: <strong>${user.userId}</strong></p>
                    <p>Login to continue your journey with LIRA.</p>
                </div>
            `
        );
        
        res.json({ success: true, message: 'User ID sent to your email' });
        
    } catch (error) {
        console.error('Forgot ID error:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// Forgot Password
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { userId, email } = req.body;
        
        const user = await User.findOne({ userId, email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid User ID or Email' });
        }
        
        // Generate OTP
        const otp = generateOTP();
        
        // Store OTP in session
        req.session.resetOTP = otp;
        req.session.resetUserId = userId;
        req.session.otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
        
        // Send email with OTP
        await sendEmail(
            email,
            'Password Reset OTP - LIRA',
            `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Password Reset Request</h2>
                    <p>Dear ${user.name},</p>
                    <p>Your OTP for password reset is:</p>
                    <h1 style="font-size: 32px; color: #4CAF50;">${otp}</h1>
                    <p>This OTP is valid for 10 minutes.</p>
                    <p>If you didn't request this, please ignore this email.</p>
                </div>
            `
        );
        
        res.json({ success: true, message: 'OTP sent to your email' });
        
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// Verify OTP and Reset Password
app.post('/api/reset-password', async (req, res) => {
    try {
        const { otp, newPassword } = req.body;
        
        if (!req.session.resetOTP || !req.session.resetUserId) {
            return res.status(400).json({ error: 'Session expired' });
        }
        
        if (Date.now() > req.session.otpExpiry) {
            return res.status(400).json({ error: 'OTP expired' });
        }
        
        if (otp !== req.session.resetOTP) {
            return res.status(400).json({ error: 'Invalid OTP' });
        }
        
        // Store plain text password
        await User.findOneAndUpdate(
            { userId: req.session.resetUserId },
            { password: newPassword } // Plain text
        );
        
        // Clear session data
        delete req.session.resetOTP;
        delete req.session.resetUserId;
        delete req.session.otpExpiry;
        
        res.json({ success: true, message: 'Password reset successful' });
        
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Change Password (Logged in user)
app.post('/api/change-password', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const { currentPassword, newPassword } = req.body;
        
        const user = await User.findOne({ userId: req.session.userId });
        
        // Plain text comparison
        if (currentPassword !== user.password) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }
        
        user.password = newPassword; // Plain text
        await user.save();
        
        res.json({ success: true, message: 'Password changed successfully' });
        
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// Fund Request
app.post('/api/fund-request', upload.single('screenshot'), async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const { amount, paymentMethod, utrNumber, remarks } = req.body;
        
        const requestId = 'FR' + Date.now() + Math.floor(Math.random() * 1000);
        
        await FundRequest.create({
            requestId,
            userId: req.session.userId,
            amount: Number(amount),
            paymentMethod,
            utrNumber,
            screenshot: req.file ? req.file.filename : null,
            remarks,
            requestDate: new Date()
        });
        
        res.json({ success: true, message: 'Fund request submitted successfully' });
        
    } catch (error) {
        console.error('Fund request error:', error);
        res.status(500).json({ error: 'Failed to submit request' });
    }
});

// Activation Request
app.post('/api/activation-request', upload.single('screenshot'), async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const { paymentMethod, utrNumber } = req.body;
        
        // Get activation amount from settings
        const activationSettings = await Settings.findOne({ type: 'activationSettings' });
        const amount = activationSettings?.values?.amount || 499;
        
        const requestId = 'AR' + Date.now() + Math.floor(Math.random() * 1000);
        
        await ActivationRequest.create({
            requestId,
            userId: req.session.userId,
            amount,
            paymentMethod,
            utrNumber,
            screenshot: req.file ? req.file.filename : null,
            requestDate: new Date()
        });
        
        res.json({ success: true, message: 'Activation request submitted successfully' });
        
    } catch (error) {
        console.error('Activation request error:', error);
        res.status(500).json({ error: 'Failed to submit request' });
    }
});

// Get Products
app.get('/api/products', async (req, res) => {
    try {
        const { category, search, page = 1, limit = 20 } = req.query;
        
        let query = { status: 'active' };
        if (category) query.category = category;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }
        
        const products = await Product.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));
        
        const total = await Product.countDocuments(query);
        
        res.json({
            products,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
        
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Get Single Product
app.get('/api/products/:productId', async (req, res) => {
    try {
        const product = await Product.findOne({ productId: req.params.productId });
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ error: 'Failed to fetch product' });
    }
});

// Get Categories
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await Category.find({ status: 'active' });
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// Add to Cart
app.post('/api/cart/add', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Please login first' });
        }
        
        const { productId, quantity } = req.body;
        
        const product = await Product.findOne({ productId });
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        if (product.stock < quantity) {
            return res.status(400).json({ error: 'Insufficient stock' });
        }
        
        // Initialize cart if not exists
        if (!req.session.cart) {
            req.session.cart = [];
        }
        
        // Check if product already in cart
        const existingItem = req.session.cart.find(item => item.productId === productId);
        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            req.session.cart.push({
                productId: product.productId,
                name: product.name,
                price: product.price,
                bv: product.bv,
                dp: product.dp,
                making: product.makingCharge,
                packing: product.packingCharge,
                deliveryCharge: product.deliveryCharge,
                gst: product.gst,
                quantity,
                image: product.images[0]
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Product added to cart',
            cart: req.session.cart 
        });
        
    } catch (error) {
        console.error('Add to cart error:', error);
        res.status(500).json({ error: 'Failed to add to cart' });
    }
});

// Get Cart
app.get('/api/cart', (req, res) => {
    res.json({ cart: req.session.cart || [] });
});

// Update Cart Item
app.put('/api/cart/update', (req, res) => {
    const { productId, quantity } = req.body;
    
    if (!req.session.cart) {
        return res.status(400).json({ error: 'Cart is empty' });
    }
    
    const item = req.session.cart.find(item => item.productId === productId);
    if (item) {
        if (quantity <= 0) {
            req.session.cart = req.session.cart.filter(item => item.productId !== productId);
        } else {
            item.quantity = quantity;
        }
    }
    
    res.json({ success: true, cart: req.session.cart });
});

// Remove from Cart
app.delete('/api/cart/remove/:productId', (req, res) => {
    if (req.session.cart) {
        req.session.cart = req.session.cart.filter(
            item => item.productId !== req.params.productId
        );
    }
    res.json({ success: true, cart: req.session.cart || [] });
});

// Checkout
app.post('/api/checkout', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Please login first' });
        }
        
        if (!req.session.cart || req.session.cart.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }
        
        const { address } = req.body;
        
        const user = await User.findOne({ userId: req.session.userId });
        
        // Check if user is active
        if (user.status !== 'active') {
            return res.status(400).json({ error: 'Please activate your account first' });
        }
        
        // Calculate totals
        let totalAmount = 0;
        let totalBV = 0;
        let totalDP = 0;
        
        const products = [];
        
        for (let item of req.session.cart) {
            const product = await Product.findOne({ productId: item.productId });
            if (!product || product.stock < item.quantity) {
                return res.status(400).json({ error: `Insufficient stock for ${item.name}` });
            }
            
            const itemTotal = product.price * item.quantity;
            totalAmount += itemTotal;
            totalBV += (product.bv || 0) * item.quantity;
            totalDP += (product.dp || 0) * item.quantity;
            
            products.push({
                productId: product.productId,
                name: product.name,
                quantity: item.quantity,
                price: product.price,
                bv: product.bv,
                dp: product.dp,
                making: product.makingCharge,
                packing: product.packingCharge,
                deliveryCharge: product.deliveryCharge,
                gst: product.gst,
                weight: product.weight
            });
            
            // Update stock
            product.stock -= item.quantity;
            await product.save();
        }
        
        // Check wallet balance
        if (user.wallet < totalAmount) {
            return res.status(400).json({ error: 'Insufficient wallet balance' });
        }
        
        // Check if this is first purchase
        const existingOrders = await Order.countDocuments({ userId: user.userId });
        const isFirstPurchase = existingOrders === 0;
        
        // Create order
        const orderId = generateOrderId();
        const order = await Order.create({
            orderId,
            userId: user.userId,
            products,
            totalAmount,
            totalBV,
            totalDP,
            orderDate: new Date(),
            status: 'confirmed',
            paymentMethod: 'wallet',
            paymentStatus: 'completed',
            deliveryAddress: address || user.address,
            invoiceNo: 'INV' + Date.now(),
            isFirstPurchase
        });
        
        // Deduct from wallet
        user.wallet -= totalAmount;
        user.totalPurchase += totalAmount;
        user.totalPurchaseCount += 1;
        
        // Update activation if not active (purchase activates account)
        if (user.status !== 'active') {
            user.status = 'active';
            user.activationDate = new Date();
            user.expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        } else {
            // Extend activation by 30 days from current expiry
            user.expiryDate = new Date(user.expiryDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        }
        
        await user.save();
        
        // Get income settings for first purchase vs repurchase
        const incomeSettings = await Settings.findOne({ type: 'incomeSettings' });
        const firstPurchasePercent = incomeSettings?.values?.firstPurchase || 10;
        const repurchasePercent = incomeSettings?.values?.repurchase || 5;
        
        const distributePercent = isFirstPurchase ? firstPurchasePercent : repurchasePercent;
        const distributeAmount = (totalAmount * distributePercent) / 100;
        
        // Distribute income
        await distributeIncome(orderId, user.userId, distributeAmount, 'purchase');
        
        // Distribute making + packing if configured
        const makingPackingSettings = await Settings.findOne({ type: 'makingPackingSettings' });
        if (makingPackingSettings?.values?.enabled) {
            let totalMakingPacking = 0;
            products.forEach(p => {
                totalMakingPacking += (p.making || 0) + (p.packing || 0);
            });
            
            if (totalMakingPacking > 0) {
                await distributeIncome(orderId, user.userId, totalMakingPacking, 'making');
            }
        }
        
        // Clear cart
        req.session.cart = [];
        
        // Send order confirmation email
        await sendEmail(
            user.email,
            `Order Confirmed - ${orderId}`,
            generateOrderConfirmationEmail(user.name, orderId, totalAmount, products)
        );
        
        res.json({
            success: true,
            message: 'Order placed successfully',
            orderId,
            invoice: order.invoiceNo
        });
        
    } catch (error) {
        console.error('Checkout error:', error);
        res.status(500).json({ error: 'Failed to place order: ' + error.message });
    }
});

// Get User Orders
app.get('/api/orders', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const orders = await Order.find({ userId: req.session.userId })
            .sort({ orderDate: -1 });
        
        res.json(orders);
        
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Get Single Order
app.get('/api/orders/:orderId', async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        // Check if user owns this order
        if (order.userId !== req.session.userId && req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        res.json(order);
        
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

// Generate Invoice PDF
app.get('/api/invoice/:orderId', async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        const user = await User.findOne({ userId: order.userId });
        
        const doc = new PDFDocument();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderId}.pdf`);
        
        doc.pipe(res);
        
        // Invoice Header
        doc.fontSize(20).text('LIRA MLM', 50, 50);
        doc.fontSize(10).text('GSTIN: 1234567890', 50, 80);
        doc.fontSize(10).text('Address: Mumbai, India', 50, 95);
        
        doc.fontSize(16).text('TAX INVOICE', 400, 50);
        doc.fontSize(10).text(`Invoice No: ${order.invoiceNo}`, 400, 80);
        doc.fontSize(10).text(`Date: ${new Date(order.orderDate).toLocaleDateString()}`, 400, 95);
        doc.fontSize(10).text(`Order ID: ${order.orderId}`, 400, 110);
        
        // Billing Details
        doc.fontSize(12).text('Bill To:', 50, 150);
        doc.fontSize(10).text(user.name, 50, 170);
        doc.fontSize(10).text(user.email, 50, 185);
        doc.fontSize(10).text(user.mobile, 50, 200);
        
        if (order.deliveryAddress) {
            doc.text(`${order.deliveryAddress.street}, ${order.deliveryAddress.city}`, 50, 215);
            doc.text(`${order.deliveryAddress.state} - ${order.deliveryAddress.pincode}`, 50, 230);
        }
        
        // Products Table
        let y = 280;
        doc.fontSize(10).text('Product', 50, y);
        doc.text('Qty', 300, y);
        doc.text('Price', 350, y);
        doc.text('Total', 450, y);
        
        doc.moveTo(50, y + 15).lineTo(550, y + 15).stroke();
        
        y += 30;
        order.products.forEach(product => {
            doc.text(product.name.substring(0, 30), 50, y);
            doc.text(product.quantity.toString(), 300, y);
            doc.text(`₹${product.price}`, 350, y);
            doc.text(`₹${product.price * product.quantity}`, 450, y);
            y += 20;
        });
        
        doc.moveTo(50, y + 5).lineTo(550, y + 5).stroke();
        
        // Totals
        y += 30;
        doc.text(`Subtotal: ₹${order.totalAmount}`, 400, y);
        y += 20;
        doc.text(`Total: ₹${order.totalAmount}`, 400, y);
        
        // Footer
        doc.fontSize(8).text('This is a computer generated invoice', 50, 700);
        
        doc.end();
        
    } catch (error) {
        console.error('Invoice generation error:', error);
        res.status(500).json({ error: 'Failed to generate invoice' });
    }
});

// Get Income History
app.get('/api/income-history', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const { type, status, page = 1, limit = 20 } = req.query;
        
        let query = { userId: req.session.userId };
        if (type) query.type = type;
        if (status) query.status = status;
        
        const incomes = await Income.find(query)
            .sort({ date: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));
        
        const total = await Income.countDocuments(query);
        const totalCredited = await Income.aggregate([
            { $match: { userId: req.session.userId, status: 'credited' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const totalLapsed = await Income.aggregate([
            { $match: { userId: req.session.userId, status: 'lapsed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        res.json({
            incomes,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            totalCredited: totalCredited[0]?.total || 0,
            totalLapsed: totalLapsed[0]?.total || 0
        });
        
    } catch (error) {
        console.error('Error fetching income history:', error);
        res.status(500).json({ error: 'Failed to fetch income history' });
    }
});

// Get Team Tree
app.get('/api/tree/:userId', async (req, res) => {
    try {
        const rootUser = await User.findOne({ userId: req.params.userId });
        if (!rootUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        async function buildTree(userId, depth = 0, maxDepth = 5) {
            if (depth >= maxDepth) return null;
            
            const user = await User.findOne({ userId })
                .select('userId name mobile status franchiseStage leftChild rightChild');
            
            if (!user) return null;
            
            const node = {
                id: user.userId,
                name: user.name,
                mobile: user.mobile,
                status: user.status,
                franchiseStage: user.franchiseStage,
                children: []
            };
            
            if (user.leftChild) {
                const leftNode = await buildTree(user.leftChild, depth + 1, maxDepth);
                if (leftNode) node.children.push(leftNode);
            }
            
            if (user.rightChild) {
                const rightNode = await buildTree(user.rightChild, depth + 1, maxDepth);
                if (rightNode) node.children.push(rightNode);
            }
            
            return node;
        }
        
        const tree = await buildTree(req.params.userId);
        res.json(tree);
        
    } catch (error) {
        console.error('Error building tree:', error);
        res.status(500).json({ error: 'Failed to build tree' });
    }
});

// Get Team Report
app.get('/api/team/:userId', async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.params.userId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get directs
        const directs = await User.find({ sponsorId: req.params.userId })
            .select('userId name mobile status joinDate totalPurchase franchiseStage');
        
        // Get team stats
        const teamCount = await User.countDocuments({ 
            $or: [
                { sponsorId: req.params.userId },
                { 'sponsorId': { $in: directs.map(d => d.userId) } }
            ]
        });
        
        const activeTeam = await User.countDocuments({
            $or: [
                { sponsorId: req.params.userId, status: 'active' },
                { 'sponsorId': { $in: directs.map(d => d.userId) }, status: 'active' }
            ]
        });
        
        const teamPurchase = await Order.aggregate([
            { $match: { 
                userId: { $in: [req.params.userId, ...directs.map(d => d.userId)] },
                status: 'delivered'
            }},
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        
        res.json({
            user: {
                userId: user.userId,
                name: user.name,
                directCount: user.directCount,
                activeDirect: user.activeDirect,
                leftCount: user.leftCount,
                rightCount: user.rightCount,
                level: user.level
            },
            directs,
            teamStats: {
                totalTeam: teamCount,
                activeTeam,
                totalPurchase: teamPurchase[0]?.total || 0
            }
        });
        
    } catch (error) {
        console.error('Error fetching team:', error);
        res.status(500).json({ error: 'Failed to fetch team data' });
    }
});

// Get User Profile
app.get('/api/profile', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const user = await User.findOne({ userId: req.session.userId })
            .select('-password');
        
        res.json(user);
        
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Update Profile
app.post('/api/profile/update', upload.fields([
    { name: 'profilePic', maxCount: 1 },
    { name: 'aadharFront', maxCount: 1 },
    { name: 'aadharBack', maxCount: 1 },
    { name: 'panCard', maxCount: 1 }
]), async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const { name, dob, anniversary, address, bankDetails } = req.body;
        
        const user = await User.findOne({ userId: req.session.userId });
        
        // Update basic info
        if (name) user.name = name;
        if (dob) user.dob = new Date(dob);
        if (anniversary) user.anniversary = new Date(anniversary);
        
        // Update address
        if (address) {
            user.address = {
                ...user.address,
                ...JSON.parse(address)
            };
        }
        
        // Update bank details
        if (bankDetails) {
            user.bankDetails = {
                ...user.bankDetails,
                ...JSON.parse(bankDetails)
            };
        }
        
        // Update documents
        if (req.files) {
            if (req.files.profilePic) {
                user.profilePic = req.files.profilePic[0].filename;
            }
            if (req.files.aadharFront) {
                user.documents = user.documents || {};
                user.documents.aadharFront = req.files.aadharFront[0].filename;
            }
            if (req.files.aadharBack) {
                user.documents = user.documents || {};
                user.documents.aadharBack = req.files.aadharBack[0].filename;
            }
            if (req.files.panCard) {
                user.documents = user.documents || {};
                user.documents.panCard = req.files.panCard[0].filename;
            }
        }
        
        await user.save();
        
        res.json({ success: true, message: 'Profile updated successfully' });
        
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Send OTP for Profile Update Verification
app.post('/api/send-profile-otp', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const user = await User.findOne({ userId: req.session.userId });
        
        const otp = generateOTP();
        req.session.profileOTP = otp;
        req.session.otpExpiry = Date.now() + 10 * 60 * 1000;
        
        await sendEmail(
            user.email,
            'Profile Update OTP - LIRA',
            `
                <div style="font-family: Arial, sans-serif;">
                    <h2>Profile Update Verification</h2>
                    <p>Your OTP for profile update is:</p>
                    <h1 style="font-size: 32px; color: #4CAF50;">${otp}</h1>
                    <p>This OTP is valid for 10 minutes.</p>
                </div>
            `
        );
        
        res.json({ success: true, message: 'OTP sent to your email' });
        
    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
});

// Withdrawal Request
app.post('/api/withdrawal-request', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const { amount } = req.body;
        
        const user = await User.findOne({ userId: req.session.userId });
        
        // Check if profile is complete
        if (!user.bankDetails?.accountNumber || !user.documents?.panCard) {
            return res.status(400).json({ 
                error: 'Please complete your profile with bank details and documents first' 
            });
        }
        
        // Get withdrawal settings
        const payoutSettings = await Settings.findOne({ type: 'payoutSettings' });
        const minWithdrawal = payoutSettings?.values?.minWithdrawal || 500;
        const maxWithdrawal = payoutSettings?.values?.maxWithdrawal || 50000;
        const tdsPercent = payoutSettings?.values?.tds || 10;
        const adminChargePercent = payoutSettings?.values?.adminCharge || 5;
        
        if (amount < minWithdrawal) {
            return res.status(400).json({ error: `Minimum withdrawal amount is ₹${minWithdrawal}` });
        }
        
        if (amount > maxWithdrawal) {
            return res.status(400).json({ error: `Maximum withdrawal amount is ₹${maxWithdrawal}` });
        }
        
        if (user.wallet < amount) {
            return res.status(400).json({ error: 'Insufficient wallet balance' });
        }
        
        const tds = (amount * tdsPercent) / 100;
        const adminCharge = (amount * adminChargePercent) / 100;
        const netAmount = amount - tds - adminCharge;
        
        const withdrawalId = 'WD' + Date.now() + Math.floor(Math.random() * 1000);
        
        await Withdrawal.create({
            withdrawalId,
            userId: user.userId,
            amount: Number(amount),
            tds,
            adminCharge,
            netAmount,
            requestDate: new Date(),
            status: 'pending'
        });
        
        // Deduct from wallet temporarily
        user.wallet -= amount;
        await user.save();
        
        res.json({ 
            success: true, 
            message: 'Withdrawal request submitted successfully',
            withdrawalId
        });
        
    } catch (error) {
        console.error('Withdrawal request error:', error);
        res.status(500).json({ error: 'Failed to submit withdrawal request' });
    }
});

// Get Withdrawal History
app.get('/api/withdrawals', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const withdrawals = await Withdrawal.find({ userId: req.session.userId })
            .sort({ requestDate: -1 });
        
        res.json(withdrawals);
        
    } catch (error) {
        console.error('Error fetching withdrawals:', error);
        res.status(500).json({ error: 'Failed to fetch withdrawals' });
    }
});

// Get Franchise Details
app.get('/api/franchise', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const user = await User.findOne({ userId: req.session.userId });
        
        if (!user.isFranchise) {
            // Get franchise settings
            const franchiseSettings = await Settings.findOne({ type: 'franchiseSettings' });
            
            return res.json({
                isFranchise: false,
                requirements: franchiseSettings?.values || {
                    minBulkPurchase: 10000,
                    minActiveDirects: 10,
                    minLockIn: 100000
                }
            });
        }
        
        // Get franchise data
        const franchise = await Franchise.findOne({ userId: user.userId });
        
        // Get assigned deliveries
        const deliveries = await Delivery.find({ franchiseId: user.userId })
            .sort({ deliveryDate: -1 })
            .limit(20);
        
        res.json({
            isFranchise: true,
            stage: user.franchiseStage,
            franchise: franchise || {},
            deliveries
        });
        
    } catch (error) {
        console.error('Error fetching franchise:', error);
        res.status(500).json({ error: 'Failed to fetch franchise data' });
    }
});

// Franchise Purchase (Bulk)
app.post('/api/franchise/purchase', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const { products, address } = req.body;
        
        const user = await User.findOne({ userId: req.session.userId });
        
        // Calculate total
        let totalAmount = 0;
        const orderProducts = [];
        
        for (let item of products) {
            const product = await Product.findOne({ productId: item.productId });
            if (!product) {
                return res.status(404).json({ error: `Product ${item.productId} not found` });
            }
            
            const itemTotal = product.price * item.quantity;
            totalAmount += itemTotal;
            
            orderProducts.push({
                productId: product.productId,
                name: product.name,
                quantity: item.quantity,
                price: product.price,
                bv: product.bv,
                dp: product.dp
            });
        }
        
        // Check wallet
        if (user.wallet < totalAmount) {
            return res.status(400).json({ error: 'Insufficient wallet balance' });
        }
        
        // Create franchise order
        const orderId = generateOrderId();
        const order = await Order.create({
            orderId,
            userId: user.userId,
            products: orderProducts,
            totalAmount,
            orderDate: new Date(),
            status: 'confirmed',
            paymentMethod: 'wallet',
            paymentStatus: 'completed',
            deliveryAddress: address,
            isFranchisePurchase: true
        });
        
        // Deduct from wallet
        user.wallet -= totalAmount;
        
        // Update franchise bulk purchase
        if (!user.isFranchise) {
            user.isFranchise = true;
            user.franchiseStage = 'micro';
            
            await Franchise.create({
                userId: user.userId,
                stage: 'micro',
                bulkPurchase: totalAmount,
                joinDate: new Date()
            });
        } else {
            const franchise = await Franchise.findOne({ userId: user.userId });
            if (franchise) {
                franchise.bulkPurchase += totalAmount;
                franchise.lastBulkPurchase = new Date();
                await franchise.save();
            }
        }
        
        await user.save();
        
        res.json({
            success: true,
            message: 'Franchise purchase successful',
            orderId
        });
        
    } catch (error) {
        console.error('Franchise purchase error:', error);
        res.status(500).json({ error: 'Failed to process franchise purchase' });
    }
});

// Assign Delivery to Franchise
app.post('/api/delivery/assign', async (req, res) => {
    try {
        if (!req.session.userId || req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const { orderId, franchiseId } = req.body;
        
        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        const franchise = await User.findOne({ 
            userId: franchiseId,
            isFranchise: true 
        });
        if (!franchise) {
            return res.status(404).json({ error: 'Franchise not found' });
        }
        
        // Generate OTP
        const otp = generateOTP();
        
        const delivery = await Delivery.create({
            deliveryId: 'DEL' + Date.now(),
            orderId,
            franchiseId,
            customerId: order.userId,
            products: order.products,
            otp,
            deliveryCharge: order.totalAmount * 0.05, // 5% delivery charge
            status: 'assigned'
        });
        
        order.deliveryStatus = 'assigned';
        order.deliveredBy = franchiseId;
        await order.save();
        
        // Update franchise
        const franchiseDoc = await Franchise.findOne({ userId: franchiseId });
        if (franchiseDoc) {
            franchiseDoc.pendingDelivery += 1;
            await franchiseDoc.save();
        }
        
        // Send OTP to customer
        const customer = await User.findOne({ userId: order.userId });
        await sendEmail(
            customer.email,
            'Delivery OTP - LIRA',
            `
                <div style="font-family: Arial, sans-serif;">
                    <h2>Delivery OTP</h2>
                    <p>Your OTP for order ${orderId} is:</p>
                    <h1 style="font-size: 32px; color: #4CAF50;">${otp}</h1>
                    <p>Share this OTP only with the delivery franchise.</p>
                </div>
            `
        );
        
        res.json({
            success: true,
            message: 'Delivery assigned successfully',
            deliveryId: delivery.deliveryId
        });
        
    } catch (error) {
        console.error('Assign delivery error:', error);
        res.status(500).json({ error: 'Failed to assign delivery' });
    }
});

// Complete Delivery (Franchise)
app.post('/api/delivery/complete', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const { deliveryId, otp } = req.body;
        
        const delivery = await Delivery.findOne({ 
            deliveryId,
            franchiseId: req.session.userId 
        });
        
        if (!delivery) {
            return res.status(404).json({ error: 'Delivery not found' });
        }
        
        if (delivery.otp !== otp) {
            return res.status(400).json({ error: 'Invalid OTP' });
        }
        
        delivery.otpVerified = true;
        delivery.status = 'delivered';
        delivery.deliveryDate = new Date();
        await delivery.save();
        
        // Update order
        const order = await Order.findOne({ orderId: delivery.orderId });
        order.deliveryStatus = 'delivered';
        order.status = 'delivered';
        order.deliveryDate = new Date();
        await order.save();
        
        // Update franchise
        const franchise = await Franchise.findOne({ userId: req.session.userId });
        if (franchise) {
            franchise.totalDelivery += 1;
            franchise.pendingDelivery -= 1;
            await franchise.save();
        }
        
        // Get delivery charge settings
        const deliverySettings = await Settings.findOne({ type: 'deliverySettings' });
        const franchisePercent = deliverySettings?.values?.franchisePercent || 50;
        
        // Distribute delivery charge
        const franchiseCommission = (delivery.deliveryCharge * franchisePercent) / 100;
        
        // Credit franchise
        const franchiseUser = await User.findOne({ userId: req.session.userId });
        franchiseUser.wallet += franchiseCommission;
        await franchiseUser.save();
        
        // Distribute remaining to uplines
        await distributeIncome(
            delivery.orderId,
            req.session.userId,
            delivery.deliveryCharge - franchiseCommission,
            'delivery'
        );
        
        // Send confirmation email
        const customer = await User.findOne({ userId: delivery.customerId });
        await sendEmail(
            customer.email,
            'Order Delivered - LIRA',
            `
                <div style="font-family: Arial, sans-serif;">
                    <h2>Order Delivered Successfully!</h2>
                    <p>Your order ${delivery.orderId} has been delivered.</p>
                    <p>Thank you for shopping with LIRA.</p>
                </div>
            `
        );
        
        res.json({
            success: true,
            message: 'Delivery completed successfully'
        });
        
    } catch (error) {
        console.error('Complete delivery error:', error);
        res.status(500).json({ error: 'Failed to complete delivery' });
    }
});

// Get Messages
app.get('/api/messages/:otherUserId?', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        let query = {
            $or: [
                { fromUserId: req.session.userId },
                { toUserId: req.session.userId }
            ]
        };
        
        if (req.params.otherUserId) {
            query = {
                $or: [
                    { fromUserId: req.session.userId, toUserId: req.params.otherUserId },
                    { fromUserId: req.params.otherUserId, toUserId: req.session.userId }
                ]
            };
        }
        
        const messages = await Message.find(query)
            .sort({ timestamp: 1 })
            .limit(100);
        
        // Mark as read
        if (req.params.otherUserId) {
            await Message.updateMany(
                {
                    fromUserId: req.params.otherUserId,
                    toUserId: req.session.userId,
                    read: false
                },
                { read: true, readAt: new Date() }
            );
        }
        
        res.json(messages);
        
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Send Message
app.post('/api/messages/send', upload.single('file'), async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const { toUserId, message, type } = req.body;
        
        const messageData = {
            fromUserId: req.session.userId,
            toUserId,
            message,
            type: type || 'text',
            timestamp: new Date()
        };
        
        if (req.file) {
            messageData.fileUrl = req.file.filename;
            messageData.type = req.file.mimetype.startsWith('image/') ? 'image' : 'audio';
        }
        
        const newMessage = await Message.create(messageData);
        
        // Emit via socket
        io.to(toUserId).emit('newMessage', newMessage);
        
        res.json({
            success: true,
            message: newMessage
        });
        
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Get Unread Message Count
app.get('/api/messages/unread/count', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const count = await Message.countDocuments({
            toUserId: req.session.userId,
            read: false
        });
        
        res.json({ count });
        
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({ error: 'Failed to fetch unread count' });
    }
});

// Get Chat List
app.get('/api/messages/chats/list', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const messages = await Message.find({
            $or: [
                { fromUserId: req.session.userId },
                { toUserId: req.session.userId }
            ]
        }).sort({ timestamp: -1 });
        
        const chats = new Map();
        
        for (let msg of messages) {
            const otherId = msg.fromUserId === req.session.userId ? 
                msg.toUserId : msg.fromUserId;
            
            if (!chats.has(otherId)) {
                const otherUser = await User.findOne({ userId: otherId })
                    .select('userId name profilePic role');
                
                chats.set(otherId, {
                    user: otherUser,
                    lastMessage: msg,
                    unread: !msg.read && msg.toUserId === req.session.userId
                });
            }
        }
        
        res.json(Array.from(chats.values()));
        
    } catch (error) {
        console.error('Error fetching chats:', error);
        res.status(500).json({ error: 'Failed to fetch chats' });
    }
});

// Get Dashboard Stats
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const user = await User.findOne({ userId: req.session.userId });
        
        // Get today's stats
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayIncome = await Income.aggregate([
            {
                $match: {
                    userId: user.userId,
                    date: { $gte: today },
                    status: 'credited'
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const todayOrders = await Order.countDocuments({
            userId: user.userId,
            orderDate: { $gte: today }
        });
        
        // Get monthly stats for 12-month wallet
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        
        const monthlyData = [];
        for (let i = 1; i <= 12; i++) {
            const monthData = user.monthlyFunds?.find(
                m => m.month === i && m.year === currentYear
            );
            monthlyData.push({
                month: i,
                amount: monthData?.amount || 0,
                locked: i < currentMonth ? monthData?.status === 'locked' : true
            });
        }
        
        // Get upcoming birthdays/anniversaries
        const team = await User.find({
            $or: [
                { sponsorId: user.userId },
                { 'sponsorId': { $in: await User.find({ sponsorId: user.userId }).distinct('userId') } }
            ]
        }).select('name dob anniversary');
        
        const upcoming = {
            birthdays: [],
            anniversaries: []
        };
        
        team.forEach(member => {
            if (member.dob) {
                const dob = new Date(member.dob);
                const today = new Date();
                if (dob.getMonth() === today.getMonth() && 
                    dob.getDate() >= today.getDate()) {
                    upcoming.birthdays.push(member);
                }
            }
            if (member.anniversary) {
                const ann = new Date(member.anniversary);
                const today = new Date();
                if (ann.getMonth() === today.getMonth() && 
                    ann.getDate() >= today.getDate()) {
                    upcoming.anniversaries.push(member);
                }
            }
        });
        
        res.json({
            user: {
                userId: user.userId,
                name: user.name,
                role: user.role,
                franchiseStage: user.franchiseStage,
                status: user.status,
                expiryDate: user.expiryDate
            },
            wallet: {
                main: user.wallet,
                twelveMonth: user.wallet12Month,
                monthly: monthlyData
            },
            stats: {
                totalIncome: user.totalIncome,
                totalPurchase: user.totalPurchase,
                totalWithdrawn: user.totalWithdrawn,
                directCount: user.directCount,
                activeDirect: user.activeDirect,
                level: user.level
            },
            today: {
                income: todayIncome[0]?.total || 0,
                orders: todayOrders
            },
            upcoming
        });
        
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

// Get Rewards
app.get('/api/rewards', async (req, res) => {
    try {
        const rewards = await Reward.find({ status: 'active' }).sort({ minPurchase: 1 });
        
        if (req.session.userId) {
            const user = await User.findOne({ userId: req.session.userId });
            const userRewards = await Award.find({ userId: user.userId });
            
            const rewardsWithProgress = rewards.map(reward => {
                const achieved = userRewards.find(ur => ur.rewardId === reward.rewardId);
                return {
                    ...reward.toObject(),
                    achieved: !!achieved,
                    achievedDate: achieved?.achievedDate,
                    progress: Math.min(100, (user.totalPurchase / reward.minPurchase) * 100),
                    current: user.totalPurchase,
                    target: reward.minPurchase
                };
            });
            
            res.json(rewardsWithProgress);
        } else {
            res.json(rewards);
        }
        
    } catch (error) {
        console.error('Error fetching rewards:', error);
        res.status(500).json({ error: 'Failed to fetch rewards' });
    }
});

// Generate I-Card
app.get('/api/icard/download', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const filePath = await generateICard(req.session.userId);
        
        res.download(filePath, `icard-${req.session.userId}.pdf`);
        
    } catch (error) {
        console.error('I-Card generation error:', error);
        res.status(500).json({ error: 'Failed to generate I-Card' });
    }
});

// ==================== ADMIN ROUTES ====================

// ✅ FIXED: Admin Login with PLAIN TEXT comparison
app.post('/api/admin/login', async (req, res) => {
    try {
        const { userId, password } = req.body;
        
        const user = await User.findOne({ userId, role: 'admin' });
        if (!user) {
            return res.status(400).json({ error: 'Invalid admin credentials' });
        }
        
        // PLAIN TEXT COMPARISON
        if (password !== user.password) {
            return res.status(400).json({ error: 'Invalid admin credentials' });
        }
        
        req.session.userId = user.userId;
        req.session.role = 'admin';
        
        res.json({
            success: true,
            role: 'admin',
            userId: user.userId,
            name: user.name
        });
        
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Admin Dashboard Stats
app.get('/api/admin/dashboard', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // User stats
        const totalUsers = await User.countDocuments({ role: 'user' });
        const activeUsers = await User.countDocuments({ 
            role: 'user', 
            status: 'active',
            expiryDate: { $gt: new Date() }
        });
        const todayJoins = await User.countDocuments({
            role: 'user',
            joinDate: { $gte: today }
        });
        
        // Purchase stats
        const totalPurchase = await Order.aggregate([
            { $match: { status: 'delivered' } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        
        const todayPurchase = await Order.aggregate([
            { 
                $match: { 
                    orderDate: { $gte: today },
                    status: 'delivered'
                }
            },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        
        // Franchise stats
        const totalFranchise = await User.countDocuments({ isFranchise: true });
        const microFranchise = await User.countDocuments({ franchiseStage: 'micro' });
        const miniFranchise = await User.countDocuments({ franchiseStage: 'mini' });
        const maxFranchise = await User.countDocuments({ franchiseStage: 'max' });
        
        const franchiseBuy = await Order.aggregate([
            { $match: { isFranchisePurchase: true } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        
        const todayFranchiseBuy = await Order.aggregate([
            { 
                $match: { 
                    isFranchisePurchase: true,
                    orderDate: { $gte: today }
                }
            },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        
        // Delivery stats
        const totalDeliveries = await Delivery.countDocuments();
        const deliveredToday = await Delivery.countDocuments({
            status: 'delivered',
            deliveryDate: { $gte: today }
        });
        const pendingDeliveries = await Delivery.countDocuments({ 
            status: { $in: ['assigned', 'in_transit'] }
        });
        
        // Income stats
        const totalIncome = await Income.aggregate([
            { $match: { status: 'credited' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const totalLapsed = await Income.aggregate([
            { $match: { status: 'lapsed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const todayIncome = await Income.aggregate([
            { 
                $match: { 
                    date: { $gte: today },
                    status: 'credited'
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        // Payout stats
        const totalPaid = await Withdrawal.aggregate([
            { $match: { status: 'processed' } },
            { $group: { _id: null, total: { $sum: '$netAmount' } } }
        ]);
        
        const pendingPayouts = await Withdrawal.countDocuments({ status: 'pending' });
        const todayPending = await Withdrawal.countDocuments({
            status: 'pending',
            requestDate: { $gte: today }
        });
        
        // Top buyers
        const topBuyers = await User.find({ role: 'user' })
            .sort({ totalPurchase: -1 })
            .limit(10)
            .select('userId name totalPurchase profilePic');
        
        res.json({
            users: {
                total: totalUsers,
                active: activeUsers,
                inactive: totalUsers - activeUsers,
                todayJoins
            },
            purchases: {
                total: totalPurchase[0]?.total || 0,
                today: todayPurchase[0]?.total || 0
            },
            franchise: {
                total: totalFranchise,
                micro: microFranchise,
                mini: miniFranchise,
                max: maxFranchise,
                totalBuy: franchiseBuy[0]?.total || 0,
                todayBuy: todayFranchiseBuy[0]?.total || 0
            },
            deliveries: {
                total: totalDeliveries,
                today: deliveredToday,
                pending: pendingDeliveries
            },
            income: {
                total: totalIncome[0]?.total || 0,
                today: todayIncome[0]?.total || 0,
                lapsed: totalLapsed[0]?.total || 0
            },
            payouts: {
                totalPaid: totalPaid[0]?.total || 0,
                pending: pendingPayouts,
                todayPending
            },
            topBuyers
        });
        
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

// Get All Members
app.get('/api/admin/members', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const { page = 1, limit = 20, search, status, franchise } = req.query;
        
        let query = { role: 'user' };
        if (status) query.status = status;
        if (franchise) query.isFranchise = franchise === 'true';
        
        if (search) {
            query.$or = [
                { userId: { $regex: search, $options: 'i' } },
                { name: { $regex: search, $options: 'i' } },
                { mobile: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        
        const members = await User.find(query)
            .select('-password')
            .sort({ joinDate: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));
        
        const total = await User.countDocuments(query);
        
        res.json({
            members,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
        
    } catch (error) {
        console.error('Error fetching members:', error);
        res.status(500).json({ error: 'Failed to fetch members' });
    }
});

// Update Member (Admin)
app.post('/api/admin/members/update', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const { userId, wallet, wallet12Month, status, franchiseStage, isFranchise } = req.body;
        
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (wallet !== undefined) user.wallet = Number(wallet);
        if (wallet12Month !== undefined) user.wallet12Month = Number(wallet12Month);
        if (status) user.status = status;
        if (franchiseStage) user.franchiseStage = franchiseStage;
        if (isFranchise !== undefined) {
            user.isFranchise = isFranchise;
            if (isFranchise && !user.franchiseStage) {
                user.franchiseStage = 'micro';
            }
        }
        
        await user.save();
        
        res.json({ success: true, message: 'Member updated successfully' });
        
    } catch (error) {
        console.error('Update member error:', error);
        res.status(500).json({ error: 'Failed to update member' });
    }
});

// Add Product (Admin)
app.post('/api/admin/products/add', upload.array('images', 5), async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const {
            name, category, subCategory, description,
            weight, purity, price, bv, dp, stock
        } = req.body;
        
        // Get category settings
        const categoryData = await Category.findOne({ name: category });
        if (!categoryData) {
            return res.status(400).json({ error: 'Category not found' });
        }
        
        // Calculate charges based on category
        const makingCharge = (price * categoryData.making) / 100;
        const packingCharge = (price * categoryData.packing) / 100;
        const deliveryCharge = (price * categoryData.deliveryCharge) / 100;
        const gst = (price * categoryData.gst) / 100;
        
        const productId = 'PROD' + Date.now() + Math.floor(Math.random() * 1000);
        
        const product = await Product.create({
            productId,
            name,
            category,
            subCategory,
            description,
            images: req.files?.map(f => f.filename) || [],
            weight: Number(weight),
            purity,
            makingCharge,
            packingCharge,
            deliveryCharge,
            gst,
            price: Number(price),
            bv: Number(bv),
            dp: Number(dp),
            stock: Number(stock)
        });
        
        res.json({
            success: true,
            message: 'Product added successfully',
            product
        });
        
    } catch (error) {
        console.error('Add product error:', error);
        res.status(500).json({ error: 'Failed to add product' });
    }
});

// Update Product (Admin)
app.post('/api/admin/products/update/:productId', upload.array('images', 5), async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const product = await Product.findOne({ productId: req.params.productId });
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        const updateData = req.body;
        
        // Update fields
        if (updateData.name) product.name = updateData.name;
        if (updateData.category) product.category = updateData.category;
        if (updateData.subCategory) product.subCategory = updateData.subCategory;
        if (updateData.description) product.description = updateData.description;
        if (updateData.weight) product.weight = Number(updateData.weight);
        if (updateData.purity) product.purity = updateData.purity;
        if (updateData.price) {
            product.price = Number(updateData.price);
            
            // Recalculate charges if price changed
            const categoryData = await Category.findOne({ name: product.category });
            if (categoryData) {
                product.makingCharge = (product.price * categoryData.making) / 100;
                product.packingCharge = (product.price * categoryData.packing) / 100;
                product.deliveryCharge = (product.price * categoryData.deliveryCharge) / 100;
                product.gst = (product.price * categoryData.gst) / 100;
            }
        }
        if (updateData.bv) product.bv = Number(updateData.bv);
        if (updateData.dp) product.dp = Number(updateData.dp);
        if (updateData.stock) product.stock = Number(updateData.stock);
        if (updateData.status) product.status = updateData.status;
        
        // Add new images
        if (req.files && req.files.length > 0) {
            product.images = [...product.images, ...req.files.map(f => f.filename)];
        }
        
        await product.save();
        
        res.json({
            success: true,
            message: 'Product updated successfully',
            product
        });
        
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// Delete Product (Admin)
app.delete('/api/admin/products/:productId', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        await Product.findOneAndDelete({ productId: req.params.productId });
        
        res.json({ success: true, message: 'Product deleted successfully' });
        
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// Add Category (Admin)
app.post('/api/admin/categories/add', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const { name, purchaseRate, expense, making, packing, deliveryCharge, gst } = req.body;
        
        const existing = await Category.findOne({ name });
        if (existing) {
            return res.status(400).json({ error: 'Category already exists' });
        }
        
        const category = await Category.create({
            name,
            purchaseRate: Number(purchaseRate),
            expense: Number(expense),
            making: Number(making),
            packing: Number(packing),
            deliveryCharge: Number(deliveryCharge),
            gst: Number(gst)
        });
        
        res.json({
            success: true,
            message: 'Category added successfully',
            category
        });
        
    } catch (error) {
        console.error('Add category error:', error);
        res.status(500).json({ error: 'Failed to add category' });
    }
});

// Update Category (Admin)
app.put('/api/admin/categories/:name', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const category = await Category.findOneAndUpdate(
            { name: req.params.name },
            req.body,
            { new: true }
        );
        
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        
        res.json({
            success: true,
            message: 'Category updated successfully',
            category
        });
        
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({ error: 'Failed to update category' });
    }
});

// Get Fund Requests
app.get('/api/admin/fund-requests', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const { status = 'pending' } = req.query;
        
        const requests = await FundRequest.find({ status })
            .sort({ requestDate: -1 });
        
        // Populate user details
        const requestsWithUser = await Promise.all(
            requests.map(async (req) => {
                const user = await User.findOne({ userId: req.userId })
                    .select('userId name mobile email');
                return {
                    ...req.toObject(),
                    user
                };
            })
        );
        
        res.json(requestsWithUser);
        
    } catch (error) {
        console.error('Error fetching fund requests:', error);
        res.status(500).json({ error: 'Failed to fetch fund requests' });
    }
});

// Process Fund Request
app.post('/api/admin/fund-requests/process', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const { requestId, action, remarks } = req.body;
        
        const request = await FundRequest.findOne({ requestId });
        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }
        
        if (action === 'approve') {
            // Credit to user wallet
            const user = await User.findOne({ userId: request.userId });
            user.wallet += request.amount;
            await user.save();
            
            request.status = 'approved';
            
            // Send email
            await sendEmail(
                user.email,
                'Fund Request Approved - LIRA',
                generateFundCreditEmail(user.name, request.amount, user.wallet)
            );
            
        } else if (action === 'reject') {
            request.status = 'rejected';
        }
        
        request.processDate = new Date();
        request.processedBy = req.session.userId;
        request.remarks = remarks;
        await request.save();
        
        res.json({ success: true, message: `Request ${action}d successfully` });
        
    } catch (error) {
        console.error('Process fund request error:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// Get Activation Requests
app.get('/api/admin/activation-requests', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const { status = 'pending' } = req.query;
        
        const requests = await ActivationRequest.find({ status })
            .sort({ requestDate: -1 });
        
        const requestsWithUser = await Promise.all(
            requests.map(async (req) => {
                const user = await User.findOne({ userId: req.userId })
                    .select('userId name mobile email');
                return {
                    ...req.toObject(),
                    user
                };
            })
        );
        
        res.json(requestsWithUser);
        
    } catch (error) {
        console.error('Error fetching activation requests:', error);
        res.status(500).json({ error: 'Failed to fetch activation requests' });
    }
});

// Process Activation Request
app.post('/api/admin/activation-requests/process', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const { requestId, action, remarks } = req.body;
        
        const request = await ActivationRequest.findOne({ requestId });
        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }
        
        const user = await User.findOne({ userId: request.userId });
        
        if (action === 'approve') {
            // Activate user (no income distribution)
            user.status = 'active';
            user.activationDate = new Date();
            user.expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            await user.save();
            
            request.status = 'approved';
            
            // Send email
            await sendEmail(
                user.email,
                'Account Activated - LIRA',
                `
                    <div style="font-family: Arial, sans-serif;">
                        <h2>Account Activated Successfully!</h2>
                        <p>Dear ${user.name},</p>
                        <p>Your account has been activated and is valid until ${user.expiryDate.toLocaleDateString()}.</p>
                        <p>Start building your team and earning rewards!</p>
                    </div>
                `
            );
            
        } else if (action === 'reject') {
            request.status = 'rejected';
        }
        
        request.processDate = new Date();
        request.processedBy = req.session.userId;
        request.remarks = remarks;
        await request.save();
        
        res.json({ success: true, message: `Request ${action}d successfully` });
        
    } catch (error) {
        console.error('Process activation request error:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// Get Withdrawal Requests (Admin)
app.get('/api/admin/withdrawals', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const { status = 'pending' } = req.query;
        
        const withdrawals = await Withdrawal.find({ status })
            .sort({ requestDate: -1 });
        
        const withdrawalsWithUser = await Promise.all(
            withdrawals.map(async (wd) => {
                const user = await User.findOne({ userId: wd.userId })
                    .select('userId name mobile email bankDetails');
                return {
                    ...wd.toObject(),
                    user
                };
            })
        );
        
        res.json(withdrawalsWithUser);
        
    } catch (error) {
        console.error('Error fetching withdrawals:', error);
        res.status(500).json({ error: 'Failed to fetch withdrawals' });
    }
});

// Process Withdrawal
app.post('/api/admin/withdrawals/process', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const { withdrawalId, action, transactionId, remarks } = req.body;
        
        const withdrawal = await Withdrawal.findOne({ withdrawalId });
        if (!withdrawal) {
            return res.status(404).json({ error: 'Withdrawal not found' });
        }
        
        const user = await User.findOne({ userId: withdrawal.userId });
        
        if (action === 'approve') {
            withdrawal.status = 'approved';
            withdrawal.processDate = new Date();
            withdrawal.transactionId = transactionId;
            
            // Update user's total withdrawn
            user.totalWithdrawn += withdrawal.netAmount;
            await user.save();
            
            // Send email
            await sendEmail(
                user.email,
                'Withdrawal Approved - LIRA',
                `
                    <div style="font-family: Arial, sans-serif;">
                        <h2>Withdrawal Approved!</h2>
                        <p>Dear ${user.name},</p>
                        <p>Your withdrawal request of ₹${withdrawal.amount} has been approved.</p>
                        <p><strong>Net Amount:</strong> ₹${withdrawal.netAmount}</p>
                        <p><strong>Transaction ID:</strong> ${transactionId}</p>
                        <p>Amount will be credited to your bank account within 24-48 hours.</p>
                    </div>
                `
            );
            
        } else if (action === 'reject') {
            withdrawal.status = 'rejected';
            
            // Refund to wallet
            user.wallet += withdrawal.amount;
            await user.save();
            
            // Send email
            await sendEmail(
                user.email,
                'Withdrawal Rejected - LIRA',
                `
                    <div style="font-family: Arial, sans-serif;">
                        <h2>Withdrawal Request Rejected</h2>
                        <p>Dear ${user.name},</p>
                        <p>Your withdrawal request of ₹${withdrawal.amount} has been rejected.</p>
                        <p><strong>Reason:</strong> ${remarks || 'Not specified'}</p>
                        <p>The amount has been refunded to your wallet.</p>
                    </div>
                `
            );
        }
        
        withdrawal.remarks = remarks;
        await withdrawal.save();
        
        res.json({ success: true, message: `Withdrawal ${action}d successfully` });
        
    } catch (error) {
        console.error('Process withdrawal error:', error);
        res.status(500).json({ error: 'Failed to process withdrawal' });
    }
});

// Get Income Report
app.get('/api/admin/income-report', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const { from, to, userId, type } = req.query;
        
        let query = {};
        if (from || to) {
            query.date = {};
            if (from) query.date.$gte = new Date(from);
            if (to) query.date.$lte = new Date(to);
        }
        if (userId) query.userId = userId;
        if (type) query.type = type;
        
        const incomes = await Income.find(query)
            .sort({ date: -1 })
            .limit(1000);
        
        // Group by user
        const byUser = await Income.aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$userId',
                    totalCredited: {
                        $sum: { $cond: [{ $eq: ['$status', 'credited'] }, '$amount', 0] }
                    },
                    totalLapsed: {
                        $sum: { $cond: [{ $eq: ['$status', 'lapsed'] }, '$amount', 0] }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { totalCredited: -1 } }
        ]);
        
        // Populate user details
        const byUserWithDetails = await Promise.all(
            byUser.map(async (item) => {
                const user = await User.findOne({ userId: item._id })
                    .select('userId name mobile');
                return {
                    ...item,
                    user
                };
            })
        );
        
        // Totals
        const totals = await Income.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalCredited: {
                        $sum: { $cond: [{ $eq: ['$status', 'credited'] }, '$amount', 0] }
                    },
                    totalLapsed: {
                        $sum: { $cond: [{ $eq: ['$status', 'lapsed'] }, '$amount', 0] }
                    }
                }
            }
        ]);
        
        res.json({
            incomes,
            byUser: byUserWithDetails,
            totals: totals[0] || { totalCredited: 0, totalLapsed: 0 }
        });
        
    } catch (error) {
        console.error('Error fetching income report:', error);
        res.status(500).json({ error: 'Failed to fetch income report' });
    }
});

// Update Settings
app.post('/api/admin/settings/update', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const { type, values } = req.body;
        
        const setting = await Settings.findOneAndUpdate(
            { type },
            { 
                values,
                updatedAt: new Date(),
                updatedBy: req.session.userId
            },
            { upsert: true, new: true }
        );
        
        res.json({
            success: true,
            message: 'Settings updated successfully',
            setting
        });
        
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// Get Settings
app.get('/api/admin/settings/:type', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const setting = await Settings.findOne({ type: req.params.type });
        
        res.json(setting || { type: req.params.type, values: {} });
        
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// Add Reward
app.post('/api/admin/rewards/add', upload.single('image'), async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const { name, minPurchase, description } = req.body;
        
        const rewardId = 'REW' + Date.now();
        
        const reward = await Reward.create({
            rewardId,
            name,
            minPurchase: Number(minPurchase),
            image: req.file?.filename,
            description
        });
        
        res.json({
            success: true,
            message: 'Reward added successfully',
            reward
        });
        
    } catch (error) {
        console.error('Add reward error:', error);
        res.status(500).json({ error: 'Failed to add reward' });
    }
});

// Check and Award Rewards (Cron job - can be called manually)
app.post('/api/admin/rewards/check', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const rewards = await Reward.find({ status: 'active' });
        const users = await User.find({ role: 'user' });
        
        for (let user of users) {
            for (let reward of rewards) {
                if (user.totalPurchase >= reward.minPurchase) {
                    const existing = await Award.findOne({
                        userId: user.userId,
                        rewardId: reward.rewardId
                    });
                    
                    if (!existing) {
                        await Award.create({
                            awardId: 'AW' + Date.now() + Math.random(),
                            userId: user.userId,
                            rewardId: reward.rewardId,
                            achievedDate: new Date()
                        });
                        
                        // Notify user
                        await sendEmail(
                            user.email,
                            'Congratulations! You earned a reward!',
                            `
                                <div style="font-family: Arial, sans-serif;">
                                    <h2>New Reward Unlocked! 🎉</h2>
                                    <p>Dear ${user.name},</p>
                                    <p>Congratulations! You have earned the "${reward.name}" reward.</p>
                                    <p>Your achievement has been recorded. Contact support for more details.</p>
                                </div>
                            `
                        );
                    }
                }
            }
        }
        
        res.json({ success: true, message: 'Rewards checked and awarded' });
        
    } catch (error) {
        console.error('Check rewards error:', error);
        res.status(500).json({ error: 'Failed to check rewards' });
    }
});

// Get All Orders (Admin)
app.get('/api/admin/orders', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const { status, page = 1, limit = 20 } = req.query;
        
        let query = {};
        if (status) query.status = status;
        
        const orders = await Order.find(query)
            .sort({ orderDate: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));
        
        const total = await Order.countDocuments(query);
        
        res.json({
            orders,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
        
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Update Order Status (Admin)
app.post('/api/admin/orders/update', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const { orderId, status } = req.body;
        
        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        order.status = status;
        await order.save();
        
        res.json({ success: true, message: 'Order updated successfully' });
        
    } catch (error) {
        console.error('Update order error:', error);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

// Get Franchise Activity
app.get('/api/admin/franchise-activity', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const { franchiseId } = req.query;
        
        let query = {};
        if (franchiseId) query.franchiseId = franchiseId;
        
        const deliveries = await Delivery.find(query)
            .sort({ deliveryDate: -1 })
            .limit(500);
        
        // Get franchise stats
        const franchises = await Franchise.find();
        
        const stats = await Promise.all(
            franchises.map(async (f) => {
                const user = await User.findOne({ userId: f.userId })
                    .select('userId name mobile franchiseStage');
                
                const deliveriesCount = await Delivery.countDocuments({ 
                    franchiseId: f.userId 
                });
                
                const pendingCount = await Delivery.countDocuments({ 
                    franchiseId: f.userId,
                    status: { $in: ['assigned', 'in_transit'] }
                });
                
                const totalAmount = await Delivery.aggregate([
                    { $match: { franchiseId: f.userId, status: 'delivered' } },
                    { $group: { _id: null, total: { $sum: '$deliveryCharge' } } }
                ]);
                
                return {
                    franchise: user,
                    details: f,
                    stats: {
                        totalDeliveries: deliveriesCount,
                        pendingDeliveries: pendingCount,
                        totalEarned: totalAmount[0]?.total || 0
                    }
                };
            })
        );
        
        res.json({
            deliveries,
            stats
        });
        
    } catch (error) {
        console.error('Error fetching franchise activity:', error);
        res.status(500).json({ error: 'Failed to fetch franchise activity' });
    }
});

// ==================== CRON JOBS ====================

// Check expiring/expired accounts (run daily)
app.post('/api/cron/check-expiry', async (req, res) => {
    try {
        const now = new Date();
        
        // Find expired accounts
        const expired = await User.find({
            role: 'user',
            status: 'active',
            expiryDate: { $lt: now }
        });
        
        for (let user of expired) {
            user.status = 'inactive';
            await user.save();
            
            // Notify user
            await sendEmail(
                user.email,
                'Account Expired - LIRA',
                `
                    <div style="font-family: Arial, sans-serif;">
                        <h2>Account Expired</h2>
                        <p>Dear ${user.name},</p>
                        <p>Your account has expired. Please make a purchase to reactivate.</p>
                        <a href="${process.env.BASE_URL}/index.html" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none;">Shop Now</a>
                    </div>
                `
            );
        }
        
        // Find expiring soon (7 days)
        const expiringSoon = await User.find({
            role: 'user',
            status: 'active',
            expiryDate: { 
                $gt: now,
                $lt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
            }
        });
        
        for (let user of expiringSoon) {
            await sendEmail(
                user.email,
                'Account Expiring Soon - LIRA',
                `
                    <div style="font-family: Arial, sans-serif;">
                        <h2>Account Expiring Soon</h2>
                        <p>Dear ${user.name},</p>
                        <p>Your account will expire on ${user.expiryDate.toLocaleDateString()}.</p>
                        <p>Make a purchase to extend your activation.</p>
                        <a href="${process.env.BASE_URL}/index.html" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none;">Shop Now</a>
                    </div>
                `
            );
        }
        
        res.json({
            success: true,
            expired: expired.length,
            expiringSoon: expiringSoon.length
        });
        
    } catch (error) {
        console.error('Check expiry error:', error);
        res.status(500).json({ error: 'Failed to check expiry' });
    }
});

// Check birthdays and anniversaries (run daily)
app.post('/api/cron/check-special-days', async (req, res) => {
    try {
        const today = new Date();
        
        // Find birthdays
        const birthdays = await User.find({
            $expr: {
                $and: [
                    { $eq: [{ $month: "$dob" }, today.getMonth() + 1] },
                    { $eq: [{ $dayOfMonth: "$dob" }, today.getDate()] }
                ]
            }
        });
        
        for (let user of birthdays) {
            await sendEmail(
                user.email,
                'Happy Birthday! - LIRA',
                generateBirthdayEmail(user.name)
            );
        }
        
        // Find anniversaries
        const anniversaries = await User.find({
            $expr: {
                $and: [
                    { $eq: [{ $month: "$anniversary" }, today.getMonth() + 1] },
                    { $eq: [{ $dayOfMonth: "$anniversary" }, today.getDate()] }
                ]
            }
        });
        
        for (let user of anniversaries) {
            await sendEmail(
                user.email,
                'Happy Anniversary! - LIRA',
                `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%); border-radius: 10px;">
                        <div style="background: white; padding: 30px; border-radius: 10px; text-align: center;">
                            <h1 style="color: #ff6b6b; font-size: 48px;">💑 Happy Anniversary!</h1>
                            <p style="font-size: 24px; color: #333;">Dear ${user.name},</p>
                            <p style="font-size: 18px; color: #666;">Wishing you a wonderful anniversary filled with love and happiness!</p>
                            <p style="color: #666;">- Team LIRA</p>
                        </div>
                    </div>
                `
            );
        }
        
        res.json({
            success: true,
            birthdays: birthdays.length,
            anniversaries: anniversaries.length
        });
        
    } catch (error) {
        console.error('Check special days error:', error);
        res.status(500).json({ error: 'Failed to check special days' });
    }
});

// Initialize default settings
async function initializeSettings() {
    const settings = [
        {
            type: 'incomeSettings',
            values: {
                firstPurchase: 10,
                repurchase: 5,
                levelIncome: [10, 5, 3, 2, 1, 0.5, 0.3, 0.2, 0.1, 0.05],
                levelRequirements: [
                    { level: 6, directs: 11 },
                    { level: 7, directs: 12 },
                    { level: 8, directs: 13 },
                    { level: 9, directs: 14 },
                    { level: 10, directs: 15 }
                ]
            }
        },
        {
            type: 'payoutSettings',
            values: {
                tds: 10,
                adminCharge: 5,
                minWithdrawal: 500,
                maxWithdrawal: 50000,
                withdrawalDays: ['Monday', 'Wednesday', 'Friday']
            }
        },
        {
            type: 'franchiseSettings',
            values: {
                minBulkPurchase: 10000,
                microStage: 10000,
                miniStage: {
                    activeDirects: 10,
                    lockIn: 100000
                },
                maxStage: {
                    activeDirects: 10,
                    lockIn: 1000000
                },
                maxFranchisePerPincode: 2
            }
        },
        {
            type: 'activationSettings',
            values: {
                amount: 499
            }
        },
        {
            type: 'deliverySettings',
            values: {
                enabled: true,
                franchisePercent: 50,
                distributionPercent: 50
            }
        },
        {
            type: 'makingPackingSettings',
            values: {
                enabled: true,
                distributeToLevels: 10
            }
        }
    ];
    
    for (let setting of settings) {
        const existing = await Settings.findOne({ type: setting.type });
        if (!existing) {
            await Settings.create(setting);
        }
    }
    
    console.log('✅ Default settings initialized');
}

// Initialize admin user
async function initializeAdmin() {
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
        await User.create({
            userId: 'ADMIN001',
            sponsorId: 'SYSTEM',
            name: 'Administrator',
            mobile: '9999999999',
            email: 'admin@lira.com',
            password: 'admin@123', // Plain text password
            position: 'left',
            role: 'admin',
            status: 'active',
            joinDate: new Date()
        });
        console.log('✅ Default admin created with plain text password');
    }
}

// Initialize on server start
initializeSettings();
initializeAdmin();

// ==================== FRONTEND ROUTES ====================

// Serve HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'user-login.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});

app.get('/dashboard', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/admin-dashboard', (req, res) => {
    if (req.session.role !== 'admin') {
        return res.redirect('/admin');
    }
    res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

// Catch all other routes to serve HTML files
app.get('/*.html', (req, res) => {
    const filePath = path.join(__dirname, req.path);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).sendFile(path.join(__dirname, '404.html'));
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Serving static files from: ${__dirname}`);
    console.log(`🔗 Access the app at: http://localhost:${PORT}`);
});
