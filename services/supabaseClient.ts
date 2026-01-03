// Access the global Supabase client injected via the script tag in index.html
// This avoids "Cannot read properties of null (reading 'AuthClient')" errors common in browser-only ESM setups.

declare global {
  interface Window {
    supabase: any;
    liff: any;
  }
}

// Environment variables
const ENV_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ENV_SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!ENV_SUPABASE_URL || !ENV_SUPABASE_KEY) {
    console.error("Missing Supabase Environment Variables. Please check your .env file.");
}

export const SUPABASE_URL = ENV_SUPABASE_URL || '';
export const SUPABASE_KEY = ENV_SUPABASE_KEY || '';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

interface LoginWithLineParams {
    code?: string;
    idToken?: string;
    isBinding?: boolean;
}

/**
 * Handles the LINE Login flow via Supabase Edge Function.
 * Supports both Authorization Code flow (Web) and ID Token flow (LIFF).
 * 
 * @param params Object containing code, idToken, and binding flag
 */
export const loginWithLine = async ({ code, idToken, isBinding = false }: LoginWithLineParams) => {
  try {
    let current_user_id = null;

    // If binding, get the current user ID
    if (isBinding) {
        const { data: { user } } = await supabase.auth.getUser();
        current_user_id = user?.id;
    }

    const payload: any = {
        redirect_uri: window.location.origin,
        is_binding: !!isBinding,
        current_user_id: current_user_id
    };

    // Determine payload based on flow
    if (idToken) {
        payload.id_token = idToken;
    } else if (code) {
        payload.code = code;
    } else {
        throw new Error("Missing required parameters: code or idToken");
    }

    // 1. Call Supabase Edge Function
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/line-login`,
      {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "apikey": SUPABASE_KEY // Added apikey
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Edge Function Error: ${errText}`);
    }

    const responseData = await res.json();
    console.log("LINE Login Response:", responseData);

    // 2. Handle Response
    if (isBinding) {
        // Binding mode: Return success without redirect
        return { success: true, message: "Binding successful" };
    } else {
        // Login mode: Handle action_link redirect
        if (responseData && responseData.action_link) {
            // Directly redirect browser to the magic link.
            // Supabase will handle the login and redirect back to Site URL.
            window.location.href = responseData.action_link;
            
            // Return empty object as page will redirect
            return { data: { user: null, session: null }, error: null };
        } else {
            console.error("Missing action_link. Full response:", responseData);
            throw new Error("Login failed: No action_link received from server.");
        }
    }

  } catch (error: any) {
    console.error("loginWithLine error:", error);
    throw error;
  }
};

/**
 * Calls the AI Edge Function to generate (or regenerate) a diary entry.
 * Endpoint: generate-summary
 */
export const generateDiary = async (
    rangeType: 'month' | 'year', 
    rangeValue: string, 
    forceRefresh: boolean = false
) => {
    // 1. Get the current session manually to retrieve the access token
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
        throw new Error("No active session");
    }

    // 2. Use native fetch to call the Edge Function
    // We manually set the Authorization header to `Bearer <access_token>`
    // Important: 'apikey' header is required by Supabase Gateway
    const res = await fetch(
        `${SUPABASE_URL}/functions/v1/generate-summary`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`,
                "apikey": SUPABASE_KEY 
            },
            body: JSON.stringify({
                range_type: rangeType,
                range_value: rangeValue,
                force_refresh: forceRefresh
            })
        }
    );

    // 3. Handle Errors
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Edge Function Error (${res.status}): ${errText}`);
    }

    // 4. Return the JSON response
    return await res.json();
};

/**
 * Fetches an existing journal entry from the database.
 * Matches `user_uid`, `period_type`, and strict `period_label`.
 */
export const getStoredJournal = async (userId: string, rangeType: string, periodLabel: string) => {
  console.log(`[getStoredJournal] Searching for: UID=${userId}, Type=${rangeType}, Label='${periodLabel}'`);
  
  // 1. Exact match query
  const { data, error } = await supabase
    .from('gratitude_diaries')
    .select('*')
    .eq('user_uid', userId)
    .eq('period_type', rangeType)
    .eq('period_label', periodLabel) 
    .order('created_at', { ascending: false }) 
    .limit(1);

  if (error) {
    console.error("[getStoredJournal] DB Error:", error);
    return null;
  }

  if (data && data.length > 0) {
      console.log("[getStoredJournal] Found exact match:", data[0]);
      return data[0]; 
  } else {
      console.log("[getStoredJournal] No match found.");
      return null;
  }
};

/**
 * Helper is no longer needed strictly if Edge Function handles saving,
 * but kept for backward compatibility if needed elsewhere.
 */
export const saveAiJournal = async (userId: string, rangeType: string, periodLabel: string, fullData: any) => {
  const { error } = await supabase
    .from('gratitude_diaries')
    .insert({
      user_uid: userId,
      period_type: rangeType,
      period_label: periodLabel, 
      narrative: fullData 
    });

  if (error) {
    console.error("Error saving journal:", error);
    throw error;
  }
  console.log("Journal saved to DB successfully.");
};