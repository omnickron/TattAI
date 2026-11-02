/** Shape of a `leadgen` change in a Meta page webhook. */
export interface LeadgenChangeValue {
  leadgen_id: string;
  page_id?: string;
  form_id?: string;
  ad_id?: string;
  adgroup_id?: string;
  created_time?: number;
}

export interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    changes?: Array<{ field?: string; value?: unknown }>;
  }>;
}

/** Lead object as returned by the Graph API (`GET /{leadgen_id}`). */
export interface MetaLeadData {
  id: string;
  created_time?: string;
  form_id?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  platform?: string;
  field_data?: Array<{ name: string; values: string[] }>;
  custom_disclaimer_responses?: Array<{ checkbox_key: string; is_checked: string | boolean }>;
}

export interface MetaLeadFetcher {
  fetchLead(leadgenId: string): Promise<MetaLeadData>;
}
