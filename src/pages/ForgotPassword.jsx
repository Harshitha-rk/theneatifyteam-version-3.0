/* src/pages/ForgotPassword.jsx */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../components/supabaseClient";
import { Helmet } from "react-helmet-async";

import "./ForgotPassword.css";

function ForgotPassword() {

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleResetRequest = async (e) => {
    e.preventDefault();
    if (!email) return setError("Please enter your email address.");

    setLoading(true);
    setError("");
    setMessage("");

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    setLoading(false);

    if (resetError) {
      console.error("Password Reset Error:", resetError);
      // Use the raw message from Supabase if available, otherwise fallback to translation
      const errorMsg = resetError.message || "Failed to send reset link.";
      setError(errorMsg);
    } else {
      setMessage("Password reset link sent! Please check your email.");
    }
  };

  return (
    <div className="auth-page">
      <Helmet>
        <title>Forgot Password | The Neatify Team | Cleaning Services in Hyderabad</title>
        <link rel="canonical" href="https://www.theneatifyteam.in/forgot-password" />
      </Helmet>
      <div className="auth-card">
        <h2 className="auth-title">Forgot Password</h2>
        <p className="auth-subtitle">Enter your email to receive a password reset link.</p>

        {message && <div className="success-message">{message}</div>}
        {error && <div className="error-message">{error}</div>}


        <form onSubmit={handleResetRequest}>
          <input
            className="auth-input"
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <button className="auth-button" type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        <p className="auth-text">
          Remember your password?{" "}
          <span onClick={() => navigate("/login")}>Login</span>
        </p>
      </div>
    </div>
  );
}

export default ForgotPassword;