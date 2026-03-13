import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { supabase } from "../components/supabaseClient";

/**
 * AuthCallback
 * ------------
 * Landing page after Google OAuth redirect.
 * Decides whether the user is new (→ /complete-profile) or existing (→ /services).
 */
function AuthCallback() {
    const navigate = useNavigate();

    useEffect(() => {
        const handleCallback = async () => {
            try {
                // Supabase JS automatically parses the hash / query params and
                // establishes the session when getSession() is called.
                const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                if (sessionError) throw sessionError;

                if (!session?.user) {
                    navigate("/login", { replace: true });
                    return;
                }

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
                    // ✨ New user (no completed profile) — send to complete profile
                    navigate("/complete-profile", { replace: true });
                } else {
                    // ✅ Existing user — go straight to services
                    navigate("/services", { replace: true });
                }
            } catch (error) {
                console.error("Auth callback error:", error);
                if (error.message?.includes("JWT") || error.message?.includes("sub claim")) {
                    await supabase.auth.signOut();
                    navigate("/login", { replace: true });
                }
            }
        };

        handleCallback();
    }, [navigate]);

    return (
        <>
            <Helmet>
                <link rel="canonical" href="https://www.theneatifyteam.in/auth/callback" />
            </Helmet>
            <div
                style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "100vh",
                fontSize: "1.1rem",
                color: "#888",
            }}
        >
            Signing you in…
        </div>
        </>
    );
}

export default AuthCallback;
