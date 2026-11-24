
import { supabase, publicUrl } from '../lib/supabase.js';
import { getAuth } from '../state/auth.js';
import { validateImageFile } from '../lib/image.js';
import { uniqueSlug } from '../lib/format.js';

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

const uid = () => getAuth().user.id;

export async function getMyBusiness() {
  return must(
    await supabase
      .from('businesses')
      .select('*')
      .eq('owner_id', uid())
      .maybeSingle()
  );
}

const FIELDS = [
  'kind', 'name', 'tagline', 'description',
  'category_id', 'location_id', 'address',
  'phone', 'whatsapp', 'email', 'website'
];

const SOCIAL_KEYS = [
  'facebook', 'instagram', 'tiktok', 'linkedin', 'youtube'
];

const cleanSocialLinks = (values = {}) =>
  Object.fromEntries(
    SOCIAL_KEYS
      .map((key) => [key, String(values[key] || '').trim()])
      .filter(([, value]) => value)
  );

export async function saveBusiness(existing, values) {
  const payload = {};

  FIELDS.forEach((f) => {
    payload[f] = values[f] === '' ? null : values[f];
  });

  if (existing) {
    return must(
      await supabase
        .from('businesses')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single()
    );
  }

  return must(
    await supabase
      .from('businesses')
      .insert({
        ...payload,
        owner_id: uid(),
        slug: uniqueSlug(values.name)
      })
      .select()
      .single()
  );
}

export async function saveAvailability(businessId, availability) {
  must(
    await supabase
      .from('businesses')
      .update({ availability })
      .eq('id', businessId)
      .eq('owner_id', uid())
  );
}

// --- PERSONNALISATION DE LA VITRINE ---
export async function saveShowcaseSettings(businessId, values) {
  const hex = (value, fallback) =>
    /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;

  const social_links = cleanSocialLinks(values.social_links);

  try {
    const { data, error } = await supabase
      .from('businesses')
      .update({
        brand_primary_color: hex(
          values.brand_primary_color,
          '#0B1640'
        ),
        brand_accent_color: hex(
          values.brand_accent_color,
          '#3DDC97'
        ),
        social_links
      })
      .eq('id', businessId)
      .eq('owner_id', uid())
      .select('id')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error(
        "Aucune fiche professionnelle n'a été modifiée. Vérifie que tu es connecté avec le compte propriétaire."
      );
    }

    return data;

  } catch (error) {
    console.error(
      'Erreur lors de la sauvegarde de la vitrine :',
      error
    );
    throw error;
  }
}

// --- IMAGE DE COUVERTURE ---
export async function uploadCover(businessId, file) {
  const check = await validateImageFile(file);
  if (!check.ok) throw new Error(check.error);

  const path = `${uid()}/cover-${Date.now()}.${check.ext}`;

  must(
    await supabase.storage
      .from('business-media')
      .upload(path, file, { contentType: check.type })
  );

  const { error } = await supabase
    .from('businesses')
    .update({ cover_path: path })
    .eq('id', businessId)
    .eq('owner_id', uid());

  if (error) {
    await supabase.storage.from('business-media').remove([path]);
    throw error;
  }

  return publicUrl('business-media', path);
}

// --- LOGO ---
export async function uploadLogo(businessId, file) {
  const check = await validateImageFile(file);
  if (!check.ok) throw new Error(check.error);

  const path = `${uid()}/logo-${Date.now()}.${check.ext}`;

  must(
    await supabase.storage
      .from('business-media')
      .upload(path, file, { contentType: check.type })
  );

  must(
    await supabase
      .from('businesses')
      .update({ logo_path: path })
      .eq('id', businessId)
      .eq('owner_id', uid())
  );

  return publicUrl('business-media', path);
}

// --- PRESTATIONS ---
export async function listServices(businessId) {
  return must(
    await supabase
      .from('services')
      .select('*')
      .eq('business_id', businessId)
      .order('item_type')
      .order('sort_order')
      .order('created_at')
  );
}

const toInt = (v) =>
  v === '' || v == null ? null : Number(v);

export async function saveService(businessId, values, id = null) {
  const row = {
    business_id: businessId,
    item_type: values.item_type === 'product' ? 'product' : 'service',
    title: values.title,
    description: values.description || null,
    price_from: toInt(values.price_from),
    price_to: toInt(values.price_to)
  };

  if (id) {
    must(
      await supabase
        .from('services')
        .update(row)
        .eq('id', id)
        .eq('business_id', businessId)
    );
  } else {
    must(await supabase.from('services').insert(row));
  }
}

export async function deleteService(id) {
  must(await supabase.from('services').delete().eq('id', id));
}

// --- GALERIE ---
export async function listImages(businessId) {
  const rows = must(
    await supabase
      .from('portfolio_images')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at')
  );

  return rows.map((r) => ({
    ...r,
    url: publicUrl('business-media', r.path)
  }));
}

export async function addImage(businessId, file, caption) {
  const existing = await listImages(businessId);

  if (existing.length >= 10) {
    throw new Error('La galerie est limitée à 10 images.');
  }

  const check = await validateImageFile(file);
  if (!check.ok) throw new Error(check.error);

  const path = `${uid()}/${crypto.randomUUID()}.${check.ext}`;

  must(
    await supabase.storage
      .from('business-media')
      .upload(path, file, { contentType: check.type })
  );

  const { error } = await supabase
    .from('portfolio_images')
    .insert({
      business_id: businessId,
      path,
      caption: caption || null
    });

  if (error) {
    await supabase.storage.from('business-media').remove([path]);
    throw error;
  }
}

export async function setFeaturedImage(image) {
  must(
    await supabase
      .from('portfolio_images')
      .update({ is_featured: true })
      .eq('id', image.id)
      .eq('business_id', image.business_id)
  );
}

export async function deleteImage(image) {
  must(
    await supabase
      .from('portfolio_images')
      .delete()
      .eq('id', image.id)
  );

  await supabase.storage
    .from('business-media')
    .remove([image.path]);

  if (image.is_featured) {
    const remaining = await listImages(image.business_id);

    if (remaining.length) {
      await setFeaturedImage(remaining[0]);
    }
  }
}

// --- STATISTIQUES / ABONNEMENT ---
export async function getStats(businessId, days = 30) {
  return must(
    await supabase.rpc('business_stats', {
      p_business: businessId,
      p_days: days
    })
  );
}

export async function listPayments(businessId) {
  return must(
    await supabase
      .from('payments')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(50)
  );
}

export async function listSubscriptions(businessId) {
  return must(
    await supabase
      .from('subscriptions')
      .select('*')
      .eq('business_id', businessId)
      .order('ends_at', { ascending: false })
      .limit(20)
  );
}

export async function startTestPayment(businessId) {
  return must(
    await supabase.rpc('start_test_payment', {
      p_business: businessId
    })
  );
}

export async function listReviews(businessId) {
  return must(
    await supabase.rpc('business_reviews', {
      p_business: businessId
    })
  );
}
