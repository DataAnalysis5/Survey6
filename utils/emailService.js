import nodemailer from "nodemailer"
import dotenv from "dotenv"

dotenv.config()

// Create a more robust transporter with additional options for Gmail
const createTransporter = () => {
  // Log email configuration (without showing the full password)
  console.log(`Configuring email with user: ${process.env.EMAIL_USER}`)

  return nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER, // Use environment variable for email
      pass: process.env.EMAIL_PASSWORD, // Use environment variable for password (App Password)
    },
    tls: {
      // Do not fail on invalid certificates
      rejectUnauthorized: false,
    },
  })
}

export const sendVerificationEmail = async (email, otp) => {
  try {
    const transporter = createTransporter()

    const mailOptions = {
      from: `"Survey App" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Email Verification",
      html: `
        <h1>Email Verification</h1>
        <p>Your OTP for email verification is: <strong>${otp}</strong></p>
        <p>This OTP will expire in 10 minutes.</p>
      `,
    }

    console.log(`Attempting to send verification email to: ${email}`)
    const info = await transporter.sendMail(mailOptions)
    console.log(`Email sent successfully: ${info.messageId}`)
    return info
  } catch (error) {
    console.error("Error sending verification email:", error)
    throw error
  }
}

