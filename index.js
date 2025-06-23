const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const supabase = require("./supabaseClient");
const fs = require("fs");
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

//  Multer Config (for image upload)
const storage = multer.memoryStorage();
const upload = multer({ storage });

const API_SECRET_KEY = "jk";

const authenticateKey = (req, res, next) => {
  const clientKey = req.headers["x-api-key"];
  if (clientKey !== API_SECRET_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};
//POST Route to Upload and Save Doctor Info
app.post("/add-doctor", authenticateKey, async (req, res) => {
  try {
    const {
      doctor_name,
      specialty,
      doctor_email,
      doctor_password,
      education,
      experience,
      fee,
      about_me,
      city,
      image_url
    } = req.body;

    // Hash Password
    const hashedPassword = await bcrypt.hash(doctor_password, 10);

    // Insert Doctor into DB
    const { error: insertError } = await supabase.from("doctors").insert([
      {
        doctor_name,
        specialty,
        doctor_email,
        doctor_password: hashedPassword,
        education,
        experience,
        fee,
        about_me,
        city,
        image_url,
      },
    ]);

    if (insertError) return res.status(500).json({ error: insertError.message });

    res.json({ message: "Doctor added to database successfully." });
  } catch (err) {
    console.error("Add Doctor Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/get-doctors", authenticateKey, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("doctors")
      .select("*");

    if (error) return res.status(500).json({ error: error.message });

    res.json({ doctors: data });
  } catch (err) {
    console.error("Fetch Doctors Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/upload-image",authenticateKey, upload.single("image"), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    const filePath = `doctors/${Date.now()}_${file.originalname}`;
    const { error: uploadError } = await supabase.storage
      .from("doc-cantainer")
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
      });

    if (uploadError) return res.status(400).json({ error: uploadError });

    const { data: urlData } = supabase.storage
      .from("doc-cantainer")
      .getPublicUrl(filePath);

    return res.json({ image_url: urlData.publicUrl });
  } catch (err) {
    console.error("Upload Error:", err);
    return res.status(500).json({ error: "Image upload failed" });
  }
});


app.post("/signup",authenticateKey, async (req, res) => {
  const { email, password, username } = req.body;

  const { user, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: username,
      },
    },
  });

  if (error) return res.status(400).json({ error: "ji" });

  res.json({
    details: user,
    message:
      "Signup successful! Please check your email to confirm your account.",
  });
});


//     app.post("/send-email", async (req, res) => {
//   try {
//     const { name, email } = req.body;

//     const payload = {
//       service_id: "service_30z1yyq",       
//       template_id: "template_s3flrzc",     
//       user_id: "fRJmgKsLAgJm5CX3P",        
//       template_params: {
//         name: name,     // match variable names in your EmailJS template
//         email: email
//       }
//     };

//     const response = await axios.post(
//       "https://api.emailjs.com/api/v1.0/email/send",
//       payload,
//       {
//         headers: {
//           "Content-Type": "application/json"
//         }
//       }
//     );

//     res.json({ message: "Email sent successfully", details: response.data });
//   } catch (err) {
//     console.error("Email Send Error:", err?.response?.data || err.message);
//     res.status(500).json({ error: "Failed to send email", details: err?.response?.data || err.message });
//   }
// });

app.post("/register-doctor-auth",authenticateKey, async (req, res) => {
  try {
    const { doctor_email, doctor_password } = req.body;

    const { error } = await supabase.auth.admin.createUser({
      email: doctor_email,
      password: doctor_password,
      email_confirm: false, // false triggers confirmation email
    });

    if (error) return res.status(500).json({ error: error.message });

    res.json({ message: "Doctor registered in Supabase Auth and confirmation email sent." });
  } catch (err) {
    console.error("Auth Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/doctors",authenticateKey, async (req, res) => {
  try {
    const { data, error } = await supabase.from("doctors").select("*");

    if (error) return res.status(500).json({ error: error.message });

    res.json({ doctors: data }); // return all doctor rows
  } catch (err) {
    console.error("Fetch Doctors Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

 app.post('/check-user',authenticateKey, async (req, res) => {
    const { email } = req.body;
  
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }
  
    try {
        const { data, error } = await supabase
        .from('user_emails')
        .select('*')
        .eq('email', email)
        .single();
  
      if (error && error.code !== 'PGRST116') {
        return res.status(500).json({ error: error.message });
      }
  
      if (!data) {
        return res.json({ exists: false, message: 'User does not exist.' });
      }
  
      res.json({ exists: true, user: data });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

app.listen(3000, () => {
  console.log(" Server running on http://localhost:3000");
});
