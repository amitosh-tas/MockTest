// server.js
const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const cors = require('cors');

const app = express();

// Middleware to parse JSON and form data, and handle CORS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Initialize Razorpay instance with your Test Keys
// In production, ALWAYS store these in environment variables (process.env.RAZORPAY_KEY_ID)
const razorpay = new Razorpay({
    key_id: 'rzp_test_YOUR_KEY_ID',
    key_secret: 'YOUR_KEY_SECRET'
});

/**
 * ROUTE 1: Create an Order
 * This route is triggered when a customer clicks "Checkout" on your frontend.
 * It communicates with Razorpay to register an intent to pay.
 */
app.post('/create-order', async (req, res) => {
    try {
        const { amount, currency } = req.body;

        if (!amount) {
            return res.status(400).json({ error: "Amount is required" });
        }

        // Razorpay expects amount in paise (1 INR = 100 paise)
        // e.g., if amount is ₹500, pass 50000
        const options = {
            amount: Number(amount) * 100,
            currency: currency || "INR",
            receipt: `receipt_order_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);

        // Send the order object back to the frontend
        res.status(200).json({
            success: true,
            order_id: order.id,
            amount: order.amount,
            currency: order.currency
        });

    } catch (error) {
        console.error("Error creating Razorpay order:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * ROUTE 2: Verify Payment Signature
 * This route is triggered AFTER the user enters card details and authorizes payment.
 * Razorpay frontend returns critical tokens which MUST be verified server-side.
 */
app.post('/verify-payment', (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, error: "Missing verification parameters" });
        }

        // Step 1: Create the signature payload by concatenating order_id and payment_id with a pipe (|)
        const payload = razorpay_order_id + "|" + razorpay_payment_id;

        // Step 2: Generate an HMAC hex digest using SHA256 and your Key Secret
        const expectedSignature = crypto
            .createHmac('sha256', razorpay.key_secret)
            .update(payload.toString())
            .digest('hex');

        // Step 3: Compare your generated signature against the signature returned by Razorpay
        if (expectedSignature === razorpay_signature) {
            console.log(`Payment successful for Order ID: ${razorpay_order_id}`);

            // TODO: Update your database here (e.g., set order status to 'PAID', reduce inventory)

            res.status(200).json({ success: true, message: "Payment verified successfully" });
        } else {
            console.warn(`Signature mismatch for Order ID: ${razorpay_order_id}`);
            res.status(400).json({ success: false, error: "Payment verification failed / Signature mismatch" });
        }

    } catch (error) {
        console.error("Error verifying signature:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});