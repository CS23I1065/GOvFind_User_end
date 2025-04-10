// File: index.js
const express = require('express');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');
require('dotenv').config();

// Initialize Express app
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);
const twilioPhoneNumber = 'whatsapp:+14155238886'; // Twilio sandbox number, replace with yours if different

// Helper function to extract service type and city from message
function extractQueryDetails(message) {
  let serviceType = null;
  let city = null;
  
  // List of supported service types and their synonyms
  const serviceTypes = {
    'passport': ['passport', 'passports', 'passport application'],
    'driving license': ['driving license', 'driving licence', 'driver license', 'dl', 'driving', 'driver'],
    'pan card': ['pan card', 'pan'],
    'voter id':['voter id','vote']
  };
  
  // List of supported cities and their synonyms
  const cities = {
    'chennai': ['chennai', 'madras'],
    'mumbai': ['mumbai', 'bombay'],
    'delhi': ['delhi', 'new delhi'],
    'kolkata':['kolkata','calcutta'],
    'bangalore':['bangalore','bengaluru']
    // Add more cities as needed
  };
  
  // Convert message to lowercase for easier matching
  const lowerMessage = message.toLowerCase();
  
  // Check for service types in the message
  for (const [type, synonyms] of Object.entries(serviceTypes)) {
    if (synonyms.some(synonym => lowerMessage.includes(synonym))) {
      serviceType = type;
      break;
    }
  }
  
  // Check for cities in the message
  for (const [name, synonyms] of Object.entries(cities)) {
    if (synonyms.some(synonym => lowerMessage.includes(synonym))) {
      city = name;
      break;
    }
  }
  
  return { serviceType, city };
}

// Format office details for WhatsApp message
function formatOfficeDetails(office) {
  return `*${office.office_name}*\n\n`
       + `📍 *Address*: ${office.address}\n`
       + `⏰ *Timings*: ${office.timings}\n`
       + `📞 *Contact*: ${office.contact_number}\n`
       + `🌐 *Website*: ${office.website}\n`
       + `📍 *Map*: ${office.map_link}`;
}

// Webhook endpoint for incoming WhatsApp messages
app.post('/webhook', async (req, res) => {
  try {
    // Get the message body from the request
    const incomingMsg = req.body.Body;
    const senderID = req.body.From;
    
    console.log(`Received message: ${incomingMsg} from ${senderID}`);
    
    // Extract service type and city from message
    const { serviceType, city } = extractQueryDetails(incomingMsg);
    
    if (!serviceType || !city) {
      // If we couldn't extract both service type and city, ask for clarification
      await client.messages.create({
        body: "I couldn't understand your query completely. Please specify both the service (passport, driving license, ration card) and the city. For example: 'Where do I apply for a passport in Chennai?'",
        from: twilioPhoneNumber,
        to: senderID
      });
      
      return res.status(200).send();
    }
    
    // Query the database for matching office
    const { data, error } = await supabase
      .from('government_offices')
      .select('*')
      .eq('service_type', serviceType)
      .eq('city', city);
    
    if (error) {
      console.error('Database query error:', error);
      await client.messages.create({
        body: "Sorry, I encountered an error while searching for office information. Please try again later.",
        from: twilioPhoneNumber,
        to: senderID
      });
      
      return res.status(200).send();
    }
    
    if (data && data.length > 0) {
      // Found matching office(s)
      const office = data[0]; // Taking the first match
      const formattedMessage = formatOfficeDetails(office);
      
      await client.messages.create({
        body: `Here's where you can apply for a ${serviceType} in ${city}:\n\n${formattedMessage}`,
        from: twilioPhoneNumber,
        to: senderID
      });
    } else {
      // No matching office found
      await client.messages.create({
        body: `Sorry, I couldn't find information about ${serviceType} services in ${city}. Please check if the service and city are correctly specified.`,
        from: twilioPhoneNumber,
        to: senderID
      });
    }
    
    return res.status(200).send();
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).send();
  }
});

// Basic route for checking if the server is running
app.get('/', (req, res) => {
  res.send('Government Office Finder WhatsApp Bot is running!');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
