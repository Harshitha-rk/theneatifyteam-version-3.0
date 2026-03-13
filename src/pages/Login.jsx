import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../components/supabaseClient";
import { FiEye, FiEyeOff, FiMail, FiPhone, FiLock, FiUser } from "react-icons/fi";

import { useToast } from "../components/Toast/ToastContext";
import logo from "../components/logo1.png";
import bgImage from "../components/Background-Image.png";
import "./Login.css";

function Login() {
  const [authMode, setAuthMode] = useState("login"); // 'login' or 'signup'
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const toast = useToast();

  /* ================= CHECK SESSION ================= */
  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session?.user) return;

        const user = session.user;

        const { data: profile, error: profileError } = await supabase
          .from("profile")
          .select("full_name, phone")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        const profileName = profile?.full_name?.trim();
        const profilePhone = profile?.phone;

        if (!profileName || !profilePhone) {
          navigate("/complete-profile", { replace: true });
          return;
        }

        navigate("/services", { replace: true });
      } catch (error) {
        console.error("Session check error:", error);
        if (error.message?.includes("JWT") || error.message?.includes("sub claim")) {
          await supabase.auth.signOut();
          Object.keys(localStorage).forEach(key => {
            if (key.includes("supabase.auth.token") || key.startsWith("sb-")) {
              localStorage.removeItem(key);
            }
          });
        }
      }
    };

    checkUser();
  }, [navigate]);

  /* ================= AUTH ACTIONS ================= */
  const handleAuth = async () => {
    if (authMode === "signup") {
      await handleSignup();
    } else {
      await handleLogin();
    }
  };

  const handleSignup = async () => {
    if (!fullName || !email || !password || !phone) {
      toast.warning("Please fill all fields");
      return;
    }

    setLoading(true);
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone_number: phone,
          },
        },
      });

      if (authError) throw authError;

      if (authUser) {
        const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;
        const { error: profileError } = await supabase.from("profile").upsert({
          id: authUser.id,
          full_name: fullName,
          email: authUser.email,
          phone: formattedPhone,
        });

        if (profileError) console.error("Profile creation error:", profileError);

        // Also add to signup table
        await supabase.from("signup").upsert({
          id: authUser.id,
          full_name: fullName,
          email: authUser.email,
          phone: formattedPhone,
        });

        if (profileError) throw profileError;
      }

      toast.success("Signup successful!");
      navigate("/services");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      toast.warning("Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const { data: { user }, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      const { data: profile } = await supabase
        .from("profile")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

      const profileName = profile?.full_name?.trim();

      if (!profileName) {
        navigate("/complete-profile");
      } else {
        navigate("/services");
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };



  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/auth/callback",
      },
    });

    if (error) toast.error(error.message);
  };


  return (
    <div className="auth-page" style={{ backgroundImage: `url(${bgImage})` }}>
      <div className="auth-card">
        {/* Logo and Subtitle Header */}
        <div className="auth-header">
          <img src={logo} alt="Neatify Logo" className="auth-logo" />
          <h1 className="auth-brand">The Neatify Team™</h1>
          <p className="auth-subtitle">We Neatify Your Space</p>
        </div>

        {authMode === "signup" && (
          <div className="input-wrapper">
            <FiUser className="input-icon" />
            <input
              type="text"
              placeholder="Full Name"
              className="auth-input with-icon"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
        )}

        <div className="input-wrapper">
          <FiMail className="input-icon" />
          <input
            type="email"
            placeholder="Email"
            className="auth-input with-icon"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="input-wrapper">
          <FiLock className="input-icon" />
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            className="auth-input with-icon"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="eye-button"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <FiEye /> : <FiEyeOff />}
          </button>
        </div>

        {authMode === "signup" && (
          <div className="input-wrapper">
            <FiPhone className="input-icon" />
            <span className="phone-prefix">+91</span>
            <input
              type="tel"
              placeholder="Phone Number"
              className="auth-input with-icon with-prefix"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </div>
        )}

        <button className="auth-button" onClick={handleAuth} disabled={loading}>
          {loading ? "..." : authMode === "login" ? "Login" : "Create Account"}
        </button>

        {authMode === "login" && (
          <p
            className="auth-link-text"
            onClick={() => navigate("/forgot-password")}
            style={{ cursor: "pointer", marginTop: "15px", color: "#f4c430", fontWeight: "600" }}
          >
            Forgot Password
          </p>
        )}

        <div className="auth-divider">OR</div>

        <button className="auth-button google-button" onClick={handleGoogleLogin}>
          <img
            src="https://cdn-icons-png.flaticon.com/512/2991/2991148.png"
            alt="Google"
            className="google-icon"
          />
          Continue with Google
        </button>

        <p className="auth-toggle-text">
          {authMode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <span
            onClick={() => {
              setAuthMode(authMode === "login" ? "signup" : "login");
              setPassword(""); // Clear password when toggling
            }}
            className="auth-toggle-link"
          >
            {authMode === "login" ? "Sign Up" : "Login"}
          </span>
        </p>
      </div>
    </div>
  );
}

export default Login;
