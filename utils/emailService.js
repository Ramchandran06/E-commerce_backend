const nodemailer = require("nodemailer");

const sendEmail = async (options) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, 
    },
  });

  const mailOptions = {
    from: `"SIT Dress Shop" <${process.env.EMAIL_USER}>`,
    to: options.to, 
    subject: options.subject,
    text: options.message,
    html: options.html,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${options.to}`);
  } catch (error) {
    console.error(`Failed to send email to ${options.to}. Error:`, error);
   
    throw new Error("Email could not be sent.");
  }
};

module.exports = sendEmail;
