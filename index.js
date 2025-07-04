const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const supabase = require("./supabaseClient");
const fs = require("fs");
const axios = require('axios');

const app = express();
app.use(cors({
    origin: '*', 
    credentials: false
  }));
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
    const { data, error,count} = await supabase
      .from("doctors")
      .select("*",{count:"exact"});

    if (error) return res.status(500).json({ error: error.message });

    res.json({ doctors: data ,count });
  } catch (err) {
    console.error("Fetch Doctors Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/getdoctor-appointment", authenticateKey, async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) {
      return res.status(400).json({ error: "Doctor name is required" });
    }

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    const endDateObj = new Date(now);
    endDateObj.setDate(now.getDate() + 6);
    const endDate = endDateObj.toISOString().split("T")[0];

    const { data, error,count } = await supabase
      .from("appointments")
      .select("user_name, user_email, doctor_name, specialty, doctor_email, fee, date, time_slot",{count:"exact"})
      .eq("doctor_name", name.trim())
      .gte("date", today)
      .lte("date", endDate)
      .order("date", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    // Default values
    let doctorInfo = {
      user_name: "",
      user_email: "",
      doctor_name: name,
      specialty: "",
      doctor_email: "",
      fee: "",
      booked_slots: [],
    };

    if (data && data.length > 0) {
      const { user_name, user_email, doctor_name, specialty, doctor_email, fee } = data[0];

      // Filter and prepare booked slots
      const booked_slots = data.filter(item => {
        if (item.date > today) return true;

        if (item.date === today) {
          const [time, modifier] = item.time_slot.split(" ");
          let [hour, minute] = time.split(":").map(Number);
          if (modifier === "PM" && hour !== 12) hour += 12;
          if (modifier === "AM" && hour === 12) hour = 0;

          return hour > currentHour || (hour === currentHour && minute > currentMinute);
        }

        return false;
      }).map(item => ({
        date: item.date,
        time_slot: item.time_slot
      }));

      doctorInfo = {
        user_name,
        user_email,
        doctor_name,
        specialty,
        doctor_email,
        fee,
        booked_slots
      };
    }

    // Always return doctor info with slots (even if empty)
    return res.json({ doctor: doctorInfo,count });

  } catch (err) {
    console.error("Fetch Doctor Appointments Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
app.post("/getUserDetails", async (req, res) => {
  const { uid } = req.body;

  if (!uid) {
    return res.status(400).json({ error: "User_id is required" });
  }

  try {
    // Query the auth.users table using Supabase Admin API
    const { data, error } = await supabase
      .from("user_emails") // the custom view we created
      .select("*")
      .eq("id", uid)
      .single();

    if (error || !data) {
      return res.json({ exists: false });
    }

    res.json({ data: data || null });
  } catch (err) {
    console.error("Check user error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post('/check-doctor-key', async (req, res) => {
  const { email, key } = req.body;

  if (!email || !key) {
    return res.status(400).json({ error: 'Email and key are required' });
  }

  try {
    const { data, error } = await supabase
      .from('doctors')
      .select('doctor_email, key')
      .eq('doctor_email', email)
      .eq('key', key)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error checking doctor:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get("/get-user-details/:id", async (req, res) => {
  const userId = req.params.id;
  const { data, error } = await supabase
    .from("user_emails")
    .select("email, username, type")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({
    email: data.email,
    username: data.username,
    type: data.type,
  });
});

app.post("/book-appointment", authenticateKey, async (req, res) => {
  const {
    user_name,
    user_email,
    doctor_name,
    specialty,
    fee,
    doctor_email,
    date,
    time_slot
  } = req.body;

  if (!user_name || !user_email || !doctor_name || !specialty || !date || !time_slot) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const { error } = await supabase.from("appointments").insert([
      {
        user_name,
        user_email,
        doctor_name,
        specialty,
        fee,
        doctor_email,
        date,
        time_slot
      }
    ]);

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ message: "Appointment booked successfully" });
  } catch (err) {
    console.error("Book appointment error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/upcoming-appointments", authenticateKey, async (req, res) => {
  try {
    const now = new Date();

    const today = now.toISOString().split("T")[0]; // "2025-06-24"
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    const { data, error } = await supabase
      .from("appointments")
      .select("user_name, doctor_name, date, time_slot, created_at")
      .gte("date", today) 
      .order("date", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    // Filter today’s slots by time
    const upcoming = data.filter(item => {
      if (item.date > today) return true; // future dates

      if (item.date === today) {
        // Parse time_slot like "01:30 PM" into hour/minute
        const [time, modifier] = item.time_slot.split(" ");
        let [hour, minute] = time.split(":").map(Number);

        if (modifier === "PM" && hour !== 12) hour += 12;
        if (modifier === "AM" && hour === 12) hour = 0;

        return hour > currentHour || (hour === currentHour && minute > currentMinute);
      }

      return false;
    });

  const uniquePatients = new Set(upcoming.map(item => item.user_name));

    return res.json({
      appointments: upcoming,
      appointmentscount: upcoming.length,
      patientCount: uniquePatients.size
    });
  } catch (err) {
    console.error("Upcoming appointments error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/getdoctor-by-name", authenticateKey, async (req, res) => {
  try {
    const { name } = req.query;

    if (!name) {
      return res.status(400).json({ error: "Doctor name is required" });
    }

    const { data, error } = await supabase
      .from("doctors")
      .select("doctor_name, about_me, specialty, experience, fee, education,image_url")
      .eq("doctor_name", name);

    if (error) return res.status(500).json({ error: error.message });

    if (!data || data.length === 0) {
      return res.status(404).json({ error: "Doctor not found" });
    }

    res.json({ doctors: data });
  } catch (err) {
    console.error("Fetch Doctor By Name Error:", err);
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


app.post("/signup", async (req, res) => {
  const { email, password, username, type, twoStepVerification } = req.body;

  const { user, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: username,
        type: type,
        twoStepVerification: twoStepVerification,
        phone: "",
        address: "",
        gender: "",
        DOB: "",
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

app.post("/update-user-profile", async (req, res) => {
  const { user_id, updates } = req.body;

  if (!user_id || !updates) {
    return res.status(400).json({ error: "User ID and updates are required" });
  }

  try {
    const { data, error } = await supabase.auth.admin.updateUserById(user_id, {
      user_metadata: updates,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: "User profile updated successfully", data });
  } catch (err) {
    console.error("Update user metadata error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
  
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
  
    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        return res.status(403).json({ error: "Please confirm your email before logging in." });
      }
      return res.status(400).json({ error: error.message });
    }
  
    const user = data.user;
    const token = data.session.access_token;
    const username = user.user_metadata?.username;
 
  
    res.json({
      message: "Login successful",
      user: {
        email: user.email,
        username: username,
        user_id : user.id
      },
      token: token
    });
  });
  
  app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
  
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      // redirectTo: 'https://frontend-ocum.vercel.app/updatepassword' 
       redirectTo: 'http://localhost:5173/updatepassword' 
    });
  
    if (error) return res.status(400).json({ error: error.message });
  
    res.json({ message: 'Password reset email sent. Please check your inbox.' });
  });

  app.post('/update-password', async (req, res) => {
    const { access_token, refresh_token, newPassword } = req.body;
  
    if (!access_token || !refresh_token || !newPassword) {
      return res.status(400).json({ error: 'Access token, refresh token, and new password are required.' });
    }
  
    try {
      // Step 1: Set session
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
  
      if (sessionError) {
        return res.status(400).json({ error: 'Failed to set session: ' + sessionError.message });
      }
  
      // Step 2: Update password now that session is active
      const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  
      if (error) {
        return res.status(400).json({ error: 'Failed to update password: ' + error.message });
      }
  
      res.json({
        message: 'Password updated successfully. You can now log in with your new password.',
        user: data.user,
      });
    } catch (err) {
      res.status(500).json({ error: 'Server error. Please try again.' });
    }
  });
  

app.post("/check-user", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    // Query the auth.users table using Supabase Admin API
    const { data, error } = await supabase
      .from("user_emails") // the custom view we created
      .select("email, type, twostepverification")
      .eq("email", email)
      .single();

    if (error || !data) {
      return res.json({ exists: false });
    }

    res.json({ exists: true, type: data.type, to:data.twostepverification || null });
  } catch (err) {
    console.error("Check user error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
  app.post('/resend-verification', async (req, res) => {
    const { email } = req.body;
  
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }
  
    try {
      // 1. Get the user from email
      const { data: users, error: listError } = await supabase.auth.admin.listUsers({ email });
  
      if (listError) {
        return res.status(500).json({ error: listError.message });
      }
  
      const user = users.users[0];
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }
  
      if (user.email_confirmed_at) {
        return res.status(400).json({ message: 'User already verified.' });
      }
  
      // 2. Send magic link to simulate verification
      const { error: emailError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: 'https://your-app.com/verified-redirect' // adjust to your frontend
        }
      });
  
      if (emailError) {
        return res.status(500).json({ error: emailError.message });
      }
  
      res.json({ message: 'Verification email sent successfully.' });
    } catch (err) {
      res.status(500).json({ error: 'Server error. Try again later.' });
    }
  });



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
