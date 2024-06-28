const express = require('express');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default;
const fs = require('fs');
const htmlToPdf = require('html-pdf');
const { PDFDocument } = require('pdf-lib');
const bwipjs = require('bwip-js');
const os = require('os');
const axios = require('axios'); 
const mongoose = require('mongoose');
const firebaseAdmin = require('firebase-admin');
const TenantConfig = require('./TenantConfig');
dotenv.config();

const app = express();

const PORT = process.env.PORT || 4000;
const CONSUMER_KEY = process.env.CONSUMER_KEY;
const CONSUMER_SECRET = process.env.CONSUMER_SECRET;
const WOOCOMMERCE_URL = process.env.WOOCOMMERCE_URL;

const WooCommerce = new WooCommerceRestApi({
  url: WOOCOMMERCE_URL,
  consumerKey: CONSUMER_KEY,
  consumerSecret: CONSUMER_SECRET,
  version: 'wc/v3'
});

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err)); 

app.use(bodyParser.json());
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(path.join(__dirname, '')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/packing', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages/packing/pack.html'));
});
app.get('/tracking', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages/tracking/track.html'));
});
app.get('/holding', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages/holding/hold.html'));
});
app.get('/printing', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages/printing/print.html'));
});
// Authentication middleware
// firebaseAdmin.initializeApp({
//   credential: firebaseAdmin.credential.cert(serviceAccount)
// });

// app.use(async (req, res, next) => {
//   const idToken = req.headers.authorization?.split('Bearer ')[1];
//   if (!idToken) {
//     return res.status(401).json({ message: 'Unauthorized' });
//   }

//   try {
//     const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
//     req.user = decodedToken;
//     next();
//   } catch (error) {
//     res.status(401).json({ message: 'Unauthorized' });
//   }
// });

// Middleware to load tenant configuration
// const loadTenantConfig = async (req, res, next) => {
//   const user = req.user; // Assume user is attached to the request after authentication
//   if (!user) {
//     return res.status(401).json({ message: 'Unauthorized' });
//   }

//   const tenantConfig = await TenantConfig.findOne({ tenantId: user.uid });
//   if (!tenantConfig) {
//     return res.status(404).json({ message: 'Tenant configuration not found' });
//   }

//   req.tenantConfig = tenantConfig;
//   next();
// };

// Ensure routes use tenant configuration middleware
// app.use(loadTenantConfig);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route to save tenant configurations
app.post('/save-tenant-config', async (req, res) => {
  const { tenantId, consumerKey, consumerSecret, wooCommerceUrl } = req.body;
console.log(req.body);
  try {
    let tenantConfig = await TenantConfig.findOne({ tenantId:tenantId });

    if (tenantConfig) {
      tenantConfig.consumerKey = consumerKey;
      tenantConfig.consumerSecret = consumerSecret;
      tenantConfig.wooCommerceUrl = wooCommerceUrl;
    } else {
      tenantConfig = new TenantConfig({ tenantId, consumerKey, consumerSecret, wooCommerceUrl });
    }

    await tenantConfig.save();
    res.status(200).json({ message: 'Tenant configuration saved successfully.' });
  } catch (error) {
    console.error('Error saving tenant configuration:', error);
    res.status(500).json({ message: 'Error saving tenant configuration.' });
  }
});

//WhatsApp 
async function sendWhatsAppPackingNotification(phone, orderId) {
    const whatsappAPIURL = 'https://wamessage.getbob.link/vaseegrahveda';
    const apiKey = process.env.BUSINESS_ON_BOT_API_KEY;

    const data = {
        type: "template",
        phone: phone,
        language: "en_US",
        name: "packing_new",
        body: [
            {
                type: "text",
                text: orderId
            }
        ]
    };

    try {
        const response = await axios.post(whatsappAPIURL, data, {
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json'
            }
        });
        console.log('WhatsApp packing notification sent successfully:', response.data);
    } catch (error) {
        console.error('Error sending WhatsApp packing notification:', error);
    }
}

async function sendWhatsAppTrackingNotification(phone, orderId, trackingNumber, weight) {
    const whatsappAPIURL = 'https://wamessage.getbob.link/vaseegrahveda';
    const apiKey = process.env.BUSINESS_ON_BOT_API_KEY;
    const shippingPartner = determineShippingPartner(trackingNumber);
    const trackingUrl = getTrackingUrl(shippingPartner, trackingNumber);
    const data = {
        type: "template",
        phone: phone,
        language: "en_US",
        name: "tracking_pro",
        body: [
            {
                type: "text",
                text: orderId
            },
            {
                type: "text",
                text: `Shipping Partner: ${shippingPartner}`
            },
            {
                type: "text",
                text:  trackingNumber
            },
            {
                type: "text",
                text:  weight.toString()
            },
            {
                type: "text",
                text: `${trackingUrl}`
            }
        ]
    };

    try {
        const response = await axios.post(whatsappAPIURL, data, {
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json'
            }
        });
        console.log('WhatsApp tracking notification sent successfully:', response.data);
    } catch (error) {
        console.error('Error sending WhatsApp tracking notification:', error);
    }
}
async function fetchProcessingOrders(offset = 0) {
    try {
        const response = await WooCommerce.get("orders", {
            status: "processing",
            offset: offset,
            per_page: 100 
        });
        return response.data;
    } catch (error) {
        console.error("Error fetching processing orders:", error);
        return [];
    }
}

async function fetchAllProcessingOrders() {
    let allOrders = [];
    let page = 1;
    let fetchMore = true;

    while (fetchMore) {
        const response = await WooCommerce.get("orders", {
            status: "processing",
            per_page: 100,
            page: page
        });
        allOrders.push(...response.data);
        fetchMore = response.data.length === 100; 
        page++;
    }

    return allOrders;
}

function generatePDF(htmlContent) {
    return new Promise((resolve, reject) => {
        htmlToPdf.create(htmlContent, { format: 'Letter', timeout: '300000' }).toBuffer((err, buffer) => {
            if (err) {
                reject(err);
            } else {
                resolve(buffer);
            }
        });
    });
}

async function generateOrderPDF(order) {
    const htmlContent = await generateHtmlContent(order);
    try {
        const pdfBuffer = await generatePDF(htmlContent);
     
        const localFilePath = path.join(__dirname, `order_${order.id}.pdf`);
      
        fs.writeFileSync(localFilePath, pdfBuffer);
        console.log(`PDF saved locally at ${localFilePath}`);
        return pdfBuffer;
    } catch (error) {
        console.error('Error generating PDF:', error);
        throw error;
    }
}


async function generateHtmlContent(order) {
    const shipVia = await fetchShipVia(order.id);
    const barcodeData = await generateBarcode(order.id);
    const totalItems = order.line_items.reduce((acc, item) => acc + item.quantity, 0);
    const htmlContent = `
    <html>
    <head>
        <title>Order Details</title>
        <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            width: 4in;
            height: 4in;
          }
          .content {
            width: 100%;
            height: auto;
            background-color: white;
            padding: 5px;
            font-size: 13px;
          }
    
            .content p {
                font-size: 13px;
            }
    
            .content table {
                width: 100%;
                font-size: 13px;
                border-collapse: collapse;
            }
    
            .content table th,
            .content table td {
                border: 1px solid #ddd;
                padding: 5px;
                text-align: left;
            }
    
            .content table th {
                background-color: #f2f2f2;
            }
            h3, h2 {
                margin: 5px 0;
              }
        
              .seller-info {
                width: 50%;
              }
        
              .prepaid-info {
                width: 50%;
              }
        
              .products-info {
                width: 100%;
              }
        
              .to-label {
                font-weight: bold;
              }
        
              .order-id {
                margin-top: -5px;
              }
        
              .barcode {
                text-align: center; 
                margin-bottom: 10px;
              }
        
              .barcode img {
                width: auto;
                height: auto; 
                max-height: 50px; 
                margin: 0 auto;
              }

        </style>
    </head>
    <body>
        <div class="content">
            <h3>Ship Via: ${shipVia}</h3>
            <h2 style="text-align: center;">🌺Vaseegrah Veda🌿 Order ID: ${order.id}</h2>
            <div class="barcode">
            <img src="data:image/png;base64,${barcodeData}" alt="">
            </div>
            <table>
                <tr>
                    <td style="font-size: 14px; padding: 8px; text-align: center;">To</td>
                    <td>
                    <b>${order.shipping.first_name} ${order.shipping.last_name}</b><br>
                    <b>${order.shipping.address_1}</b><b>${order.shipping.address_2},</b><br>
                    <b>${order.shipping.city},</b><br>
                    <b>${order.shipping.state}-</b><b>${order.shipping.postcode}.</b><br> 
                    <b>${order.billing.phone}/${order.billing.company}</b><br>
                        
                    </td>
                </tr>
            </table>
    
            <table>
                <tbody>
                    <tr>
                        <td>
                            <b>Seller:</b><br>
                            <b>VASEEGRAH VEDA</b><br>
                            No:7 VIJAYA NAGAR,<br>
                            SRINIVASAPURAM (Post)<br>
                            THANJAVUR<br>
                            TAMIL NADU-613009<br>
                            MOBILE: 8248817165
                        </td>
                        <td>
                            <b>Prepaid Order:</b><br>
                            Date: ${order.date_created}<br>
                            Weight:<br>
                            No. of Items:${totalItems}<br>
                            Packed By: <br>
                        </td>
                    </tr>
                    <tr>
                        <td colspan="2">
                            <strong>Products:</strong>
                            ${order.line_items.map(item => `${item.name} × ${item.quantity}`).join(', ')}
                        
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </body>
    </html>
    `;
    return htmlContent;
}

async function fetchShipVia(orderId) {
    try {
        const response = await WooCommerce.get(`orders/${orderId}`);
        const shippingLines = response.data.shipping_lines;
        return shippingLines[0] && shippingLines[0].method_title || 'Unknown';
    } catch (error) {
        console.error("Error fetching ship via information:", error);
        return "Unknown";
    }
}

async function generateBarcode(orderId) {
    return new Promise((resolve, reject) => {
        bwipjs.toBuffer({
            bcid: 'code128',
            text: orderId.toString(),
            scale: 2,
            height: 7,
            includetext: false,
            textxalign: 'center'
        }, (err, png) => {
            if (err) {
                reject(err);
            } else {
                resolve(png.toString('base64'));
            }
        });
    });
}

async function hasOrderNote(orderId, noteContent) {
    try {
        const notes = await WooCommerce.get(`orders/${orderId}/notes`);
        return notes.data.some(note => note.note.includes(noteContent));
    } catch (error) {
        console.error("Error checking order notes:", error);
        return false;
    }
}

async function updateOrderNotes(orderId, noteContent) {
    if (await hasOrderNote(orderId, noteContent)) {
        console.log(`Note already exists for order ID ${orderId}, not adding again.`);
        return;
    }
    try {
        await WooCommerce.post(`orders/${orderId}/notes`, {
            note: noteContent,
            customer_note: true
        });
        console.log(`Order note updated for order ID ${orderId}`);
    } catch (error) {
        console.error("Error updating order notes:", error);
    }
}

async function generatePDFsForOrders(orders) {
    const batchSize = 10; 
    const totalOrders = orders.length;
    let processedOrders = 0; 
    const mergedPdfDoc = await PDFDocument.create(); 

    for (let i = 0; i < orders.length; i += batchSize) {
        const batchOrders = orders.slice(i, i + batchSize);
        const pdfPromises = batchOrders.map(async (order) => {
            const htmlContent = await generateHtmlContent(order);
            return generatePDF(htmlContent);
        });

        const pdfBuffers = await Promise.all(pdfPromises);

        const updatePromises = batchOrders.map(order => updateOrderNotes(order.id));
        await Promise.all(updatePromises);

        for (let j = 0; j < pdfBuffers.length; j++) {
            const pdfDoc = await PDFDocument.load(pdfBuffers[j]);
            const copiedPages = await mergedPdfDoc.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach(page => mergedPdfDoc.addPage(page));
            processedOrders++;
        }

        const percentage = ((processedOrders / totalOrders) * 100).toFixed(2);
        console.log(`Processed ${processedOrders}/${totalOrders} orders. (${percentage}%)`);
    }

    const mergedFileName = "combined-orders.pdf";
    const mergedPdfBytes = await mergedPdfDoc.save();
    const filePath = path.join(os.homedir(), 'Downloads', mergedFileName);
    fs.writeFileSync(filePath, mergedPdfBytes);
    console.log("Combined PDF file saved to Downloads folder:", filePath);

    return filePath;
}

app.get('/download-pdf/:fileName', (req, res) => {
    const fileName = req.params.fileName;
    const filePath = path.join(os.homedir(), 'Downloads', fileName);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        res.send(data);
    });
});

app.post('/generate-combined-pdf', async (req, res) => {
    try {
       

        const orders = await fetchAllProcessingOrders();
        const noteContent = "Your order has been printed successfully. The shipping label is sent to the packing department.";
        const pdfDoc = await PDFDocument.create();

        for (const order of orders) {
            if (!(await hasOrderNote(order.id, noteContent))) {
                const htmlContent = await generateHtmlContent(order);
                const pdfBuffer = await generatePDF(htmlContent);
                const pdf = await PDFDocument.load(pdfBuffer);
                const pages = await pdfDoc.copyPages(pdf, pdf.getPageIndices());
                pages.forEach(page => pdfDoc.addPage(page));

                await updateOrderNotes(order.id, noteContent);
            }
            }
        

        const pdfBytes = await pdfDoc.save();

        const filePath = path.join(__dirname, 'combined-orders.pdf');
        fs.writeFileSync(filePath, pdfBytes);

        if (!fs.existsSync(filePath)) {
            return res.status(500).json({ success: false, message: 'Error saving combined PDF on the server.' });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="combined-orders.pdf"');
        res.send(Buffer.from(pdfBytes));
        
    } catch (error) {
        console.error('Error generating combined PDF:', error);
        res.status(500).json({ success: false, message: 'Error generating combined PDF.' });
    }
});


app.post('/generate-individual-pdf', async (req, res) => {
    const orderId = req.body.orderId;
    try {
        

        const orderResponse = await WooCommerce.get(`orders/${orderId}`);
        const order = orderResponse.data;

        if (order.status !== 'processing' && order.status !== 'completed') {
            return res.status(400).json({ success: false, message: 'Order is not in processing status.' });
        }

        const pdfBuffer = await generateOrderPDF(order);

        const filePath = path.join(__dirname, `order_${orderId}.pdf`);
        fs.writeFileSync(filePath, pdfBuffer);

        if (!fs.existsSync(filePath)) {
            return res.status(500).json({ success: false, message: 'Error saving PDF on the server.' });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="order_${orderId}.pdf"`);
        res.send(pdfBuffer);
        
    } catch (error) {
        console.error(`Error generating PDF for order ${orderId}:`, error);
        res.status(500).json({ success: false, message: 'Error generating individual PDF.' });
    }
});


//tracking
function determineShippingPartner(trackingNumber) {
    if (trackingNumber.startsWith("CT")) return "INDIA POST";
    if (trackingNumber.startsWith("5")) return "ST COURIER";
    if (trackingNumber.startsWith("C1")) return "DTDC";
    if (trackingNumber.startsWith("10000")) return "TRACKON";
    if (/^10(?!000)/.test(trackingNumber)) return "TRACKON";
    if (trackingNumber.startsWith("1")) return "SHIP ROCKET";
    if (trackingNumber.startsWith("S")) return "SHIP ROCKET";
    if (trackingNumber.startsWith("7")) return "DELHIVERY";
    return "Unknown";
}
 function getTrackingUrl(shippingPartner, trackingNumber) {
    switch (shippingPartner) {
        case "INDIA POST":
            return `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?${trackingNumber}`;
        case "ST COURIER":
            return `https://stcourier.com/track/shipment?${trackingNumber}`;
        case "DTDC":
            return `https://www.dtdc.in/tracking.asp?awbno=${trackingNumber}`;
        case "TRACKON":
            return `https://trackon.in/?tracking_number=${trackingNumber}`;
        case "SHIP ROCKET":
            return `https://www.shiprocket.in/shipment-tracking/?${trackingNumber}`;
        case "DELHIVERY":
            return `https://www.delhivery.com/?id=${trackingNumber}`;
        default:
            return `https://vaseegrahveda.com/tracking/${trackingNumber}`;
    }
  }
app.post('/update-tracking', async (req, res) => {
    const { orderNumber, trackingNumber, weight } = req.body;
    const shippingPartner = determineShippingPartner(trackingNumber);
    
    try {
        const orderResponse = await WooCommerce.get(`orders/${orderNumber}`);
        const order = orderResponse.data;
        const customerPhone = order.billing.phone;

        const note = `Your order has been shipped with ${shippingPartner}. Tracking number: ${trackingNumber}. Weight: ${weight}gms.`;
        const noteData = { note, customer_note: 1 };
        const notesUrl = `${WOOCOMMERCE_URL}/wp-json/wc/v3/orders/${orderNumber}/notes?consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;

        const addNoteResponse = await fetch(notesUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(noteData),
        });

        const statusData = { status: 'completed' };
        const statusUrl = `${WOOCOMMERCE_URL}/wp-json/wc/v3/orders/${orderNumber}?consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;

        const updateStatusResponse = await fetch(statusUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64'),
            },
            body: JSON.stringify(statusData),
        });

        if (addNoteResponse.ok && updateStatusResponse.ok) {
            // Send WhatsApp tracking notification
            await sendWhatsAppTrackingNotification(customerPhone, orderNumber, trackingNumber, weight);
            res.json({ success: true, message: 'Tracking updated and notification sent via WhatsApp.' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to update tracking.' });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update tracking and send tracking notification.' });
    }
});

//packing
app.get('/fetch-products/:orderNumber', async (req, res) => {
    const orderNumber = req.params.orderNumber;
    const url = `${WOOCOMMERCE_URL}/wp-json/wc/v3/orders/${orderNumber}?consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;
    const authHeader = 'Basic ' + Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');

    try {
        const response = await fetch(url, { headers: { 'Authorization': authHeader } });
        const data = await response.json();
        res.json(data.line_items);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'Error fetching data. Please try again later.' });
    }
});

app.post('/add-customer-note/:orderNumber', async (req, res) => {
    const orderNumber = req.params.orderNumber;
    try {
        const noteData = {
            note: "Your order has been verified and packed successfully, and you'll receive the tracking number shortly.",
            customer_note: true
        };
        const notesUrl = `${WOOCOMMERCE_URL}/wp-json/wc/v3/orders/${orderNumber}/notes`;
        const response = await fetch(notesUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64')
            },
            body: JSON.stringify(noteData)
        });
        if (!response.ok) {
            throw new Error('Failed to add customer note. Status: ' + response.status);
        }
        const responseData = await response.json();
         const orderResponse = await WooCommerce.get(`orders/${orderNumber}`);
         const order = orderResponse.data;
         const customerPhone = order.billing.phone;
 
         // Send WhatsApp packing notification
         await sendWhatsAppPackingNotification(customerPhone, orderNumber);

        res.json(responseData);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, message: 'Failed to add customer note.' });
    }
});

//holding
app.post('/update-holding', async (req, res) => {
    const { orderNumber, holdingReason, date } = req.body;
    const note = `Sorry for the delay in dispatching your order. Your order is on hold to freshly prepare ${holdingReason}. We expect to dispatch your order on : ${date}`;

    try {
        const noteData = { note, customer_note: 1 };
        const notesUrl = `${WOOCOMMERCE_URL}/wp-json/wc/v3/orders/${orderNumber}/notes?consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;

        const addNoteResponse = await fetch(notesUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(noteData),
        });

        const statusData = { status: 'on-hold' };
        const statusUrl = `${WOOCOMMERCE_URL}/wp-json/wc/v3/orders/${orderNumber}?consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`;

        const updateStatusResponse = await fetch(statusUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64'),
            },
            body: JSON.stringify(statusData),
        });

        if (addNoteResponse.ok && updateStatusResponse.ok) {
            res.json({ success: true, message: 'Holding updated successfully.' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to update holding.' });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update holding.' });
    }
});

//billing
const fetchProductDetails = async (sku, retries = 3) => {
    try {
        const response = await fetch(`${WOOCOMMERCE_URL}/wp-json/wc/v3/products?sku=${sku}&consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch product details: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.length === 0) {
            throw new Error('Product not found');
        }

        return data[0];
    } catch (error) {
        if (retries > 0) {
            console.error(`Retrying... (${retries} attempts left)`);
            return fetchProductDetails(sku, retries - 1);
        } else {
            throw error;
        }
    }
};

app.get('/product-details/:sku', async (req, res) => {
    const { sku } = req.params;

    try {
        const product = await fetchProductDetails(sku);
        res.json({
            productName: product.name,
            price: parseFloat(product.price),
        });
    } catch (error) {
        console.error('Error fetching product details:', error);
        res.status(500).json({ error: error.message });
    }
});
app.listen(PORT, '0.0.0.0',() => {
    console.log(`Server is running on port ${PORT}`);
});







