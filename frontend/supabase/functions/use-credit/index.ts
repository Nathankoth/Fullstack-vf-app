import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper logging function
const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[USE-CREDIT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    logStep("User authenticated", { userId: user.id });

    // Get user profile with current credits
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("id, credits")
      .eq("user_id", user.id)
      .single();

    if (profileError) {
      logStep("Profile error", { error: profileError });
      throw new Error("Failed to get user profile");
    }

    if (!profile) {
      throw new Error("User profile not found");
    }

    logStep("Current credits", { credits: profile.credits });

    if (profile.credits <= 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "No credits remaining",
        credits: 0
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 402, // Payment Required
      });
    }

    // Deduct one credit
    const newCredits = profile.credits - 1;
    const { error: updateError } = await supabaseClient
      .from("profiles")
      .update({ credits: newCredits })
      .eq("id", profile.id);

    if (updateError) {
      logStep("Update error", { error: updateError });
      throw new Error("Failed to update credits");
    }

    logStep("Credit used successfully", { newCredits });

    return new Response(JSON.stringify({ 
      success: true, 
      credits: newCredits 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in use-credit", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});