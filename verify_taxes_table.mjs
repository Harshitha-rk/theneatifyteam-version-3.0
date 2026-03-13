import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Attempting to fetch from 'taxes' table...");
    try {
        const { data, error } = await supabase
            .from('taxes')
            .select('*');

        if (error) {
            console.error("❌ Error fetching taxes:", error.message);
            console.error("Details:", error);
        } else {
            console.log("✅ Success! Data:", data);
            if (data.length === 0) {
                console.warn("⚠️ Table exists but is empty.");
            }
        }
    } catch (err) {
        console.error("❌ Exception:", err);
    }
}

check();
