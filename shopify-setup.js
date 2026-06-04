/**
 * Clariva Home — Shopify Admin API Setup Script
 * Run: node shopify-setup.js
 *
 * Prerequisites: create a Custom App token (see README below)
 * and set SHOPIFY_TOKEN env var or paste it in the config below.
 */

const STORE = 'lumera-aura.myshopify.com';
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || ''; // paste token here if not using env
const API_VERSION = '2024-10';

if (!TOKEN) {
  console.error('\n❌  SHOPIFY_ADMIN_TOKEN is not set.\n');
  console.error('  1. Go to: https://lumera-aura.myshopify.com/admin/settings/apps');
  console.error('  2. Click "Develop apps" → "Create an app" → name it "Clariva Setup"');
  console.error('  3. Configure Admin API scopes: write_products, write_content,');
  console.error('     write_publications, read_themes, write_themes');
  console.error('  4. Install app → copy Admin API access token');
  console.error('  5. Run: $env:SHOPIFY_ADMIN_TOKEN="shpat_xxx"; node shopify-setup.js\n');
  process.exit(1);
}

const BASE = `https://${STORE}/admin/api/${API_VERSION}`;
const HEADERS = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': TOKEN,
};

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`API ${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function createCollection(title, handle, description, ruleField) {
  // Check if it already exists
  const existing = await api('GET', `/custom_collections.json?handle=${handle}`);
  if (existing.custom_collections?.length > 0) {
    console.log(`  ⏭  Collection "${title}" already exists (${handle})`);
    return existing.custom_collections[0];
  }

  const payload = {
    custom_collection: {
      title,
      handle,
      body_html: description,
      sort_order: 'best-selling',
    },
  };

  const data = await api('POST', '/custom_collections.json', payload);
  console.log(`  ✅  Created collection: "${title}" (id: ${data.custom_collection.id})`);
  return data.custom_collection;
}

async function updateShopName() {
  console.log('\n📦  Updating shop name...');
  try {
    const data = await api('PUT', '/shop.json', {
      shop: {
        name: 'Clariva Home',
        email: 'info.vereine@gmail.com',
        customer_email: 'info.vereine@gmail.com',
        meta_description: 'Clariva Home — Smart kitchen gadgets and home organization solutions. Shop premium products at unbeatable prices. Ships to Canada and USA.',
      },
    });
    console.log(`  ✅  Shop name updated to: "${data.shop.name}"`);
  } catch (e) {
    console.warn(`  ⚠️  Could not update shop (may require Partner access): ${e.message}`);
  }
}

async function createCollections() {
  console.log('\n📂  Creating collections...');
  const collections = [
    {
      title: 'Kitchen Gadgets',
      handle: 'kitchen-gadgets',
      description: '<p>Smart, high-quality kitchen gadgets that make cooking faster, easier, and more enjoyable. From prep tools to storage solutions — everything your kitchen needs.</p>',
    },
    {
      title: 'Home Organization',
      handle: 'home-organization',
      description: '<p>Transform clutter into calm with our curated home organization solutions. Drawer organizers, storage bins, closet systems, and more — all designed to fit real homes.</p>',
    },
    {
      title: 'Best Sellers',
      handle: 'best-sellers',
      description: '<p>Our most-loved products, handpicked by the Clariva Home community. Quality tested, customer approved — these are the products that keep people coming back.</p>',
    },
    {
      title: 'New Arrivals',
      handle: 'new-arrivals',
      description: '<p>Just in — fresh products added to the Clariva Home collection. Be the first to discover our newest kitchen gadgets and home organization tools.</p>',
    },
    {
      title: 'Sale',
      handle: 'sale',
      description: '<p>Great deals on Clariva Home favourites. Limited time offers — shop now before they sell out!</p>',
    },
  ];

  for (const c of collections) {
    await createCollection(c.title, c.handle, c.description);
  }
}

async function createPages() {
  console.log('\n📄  Creating store pages...');
  const pages = [
    {
      title: 'About Clariva Home',
      handle: 'about',
      body_html: `
        <h2>Our Story</h2>
        <p>Clariva Home was born from a simple frustration: great home products were either too expensive or impossible to find. We set out to change that.</p>
        <p>We're a Canadian-owned brand curating the best kitchen gadgets and home organization solutions — testing each product ourselves before it ever reaches your door. Our mission is simple: beautiful, functional products for real homes, at prices that make sense.</p>
        <h2>Why We're Different</h2>
        <ul>
          <li><strong>Quality First:</strong> Every product is hand-tested by our team.</li>
          <li><strong>Real Value:</strong> Premium quality without the premium markup.</li>
          <li><strong>Canadian Roots:</strong> Proudly based in Canada, shipping across North America.</li>
          <li><strong>Customer Obsessed:</strong> 30-day returns, real support, no runaround.</li>
        </ul>
      `,
    },
    {
      title: 'Shipping Information',
      handle: 'shipping',
      body_html: `
        <h2>Shipping Policy</h2>
        <p><strong>Free Standard Shipping</strong> on all orders over $50 CAD to Canada and USA.</p>
        <h3>Estimated Delivery Times</h3>
        <ul>
          <li>Canada: 7–14 business days</li>
          <li>USA: 10–18 business days</li>
        </ul>
        <p>Orders are processed within 1–3 business days. You'll receive tracking information by email as soon as your order ships.</p>
        <h3>Order Tracking</h3>
        <p>Use the tracking number in your shipping confirmation email to track your order. Contact us at <a href="mailto:info.vereine@gmail.com">info.vereine@gmail.com</a> if you have any questions.</p>
      `,
    },
    {
      title: 'Returns & Exchanges',
      handle: 'returns',
      body_html: `
        <h2>30-Day Return Policy</h2>
        <p>We want you to love every Clariva Home product. If you're not completely satisfied, we offer hassle-free returns within 30 days of delivery.</p>
        <h3>How to Return</h3>
        <ol>
          <li>Email us at <a href="mailto:info.vereine@gmail.com">info.vereine@gmail.com</a> with your order number and reason for return.</li>
          <li>We'll send you return instructions within 1–2 business days.</li>
          <li>Ship the item back in its original packaging.</li>
          <li>Receive your refund within 5–10 business days of us receiving the item.</li>
        </ol>
        <p><strong>Items must be unused and in original condition.</strong> Sale items are final sale.</p>
      `,
    },
    {
      title: 'FAQ',
      handle: 'faq',
      body_html: `
        <h2>Frequently Asked Questions</h2>
        <h3>Do you ship internationally?</h3>
        <p>Currently we ship to Canada and the USA. More countries coming soon!</p>
        <h3>How long does shipping take?</h3>
        <p>Canada: 7–14 business days. USA: 10–18 business days. Most orders are processed within 1–3 business days.</p>
        <h3>What is your return policy?</h3>
        <p>We offer 30-day hassle-free returns on all unused items. See our <a href="/pages/returns">Returns page</a> for details.</p>
        <h3>How do I track my order?</h3>
        <p>You'll receive a tracking number by email once your order ships. Contact us at <a href="mailto:info.vereine@gmail.com">info.vereine@gmail.com</a> if you need help.</p>
        <h3>Are your products quality tested?</h3>
        <p>Yes! Every product in the Clariva Home collection is hand-selected and tested by our team before it's listed in our store.</p>
      `,
    },
    {
      title: 'Contact Us',
      handle: 'contact',
      body_html: `
        <h2>Get in Touch</h2>
        <p>Have a question? We'd love to hear from you. Our team typically responds within 24 hours.</p>
        {% form 'contact' %}
          {{ form.errors | default_errors }}
          <p><label>Name<br><input type="text" name="contact[name]" value="{{ form.name }}"></label></p>
          <p><label>Email<br><input type="email" name="contact[email]" value="{{ form.email }}"></label></p>
          <p><label>Message<br><textarea name="contact[body]">{{ form.body }}</textarea></label></p>
          <p><button type="submit">Send Message</button></p>
        {% endform %}
        <hr>
        <p><strong>Email:</strong> <a href="mailto:info.vereine@gmail.com">info.vereine@gmail.com</a></p>
        <p><strong>Response time:</strong> Within 24 hours, Monday–Friday</p>
      `,
    },
  ];

  for (const page of pages) {
    // Check if exists
    const existing = await api('GET', `/pages.json?handle=${page.handle}`);
    if (existing.pages?.length > 0) {
      console.log(`  ⏭  Page "${page.title}" already exists`);
      continue;
    }
    const data = await api('POST', '/pages.json', { page });
    console.log(`  ✅  Created page: "${data.page.title}"`);
  }
}

async function main() {
  console.log('\n🏡  CLARIVA HOME — Shopify Store Setup\n');
  console.log(`📍  Store: ${STORE}`);
  console.log(`🔑  Token: ${TOKEN.substring(0, 8)}...`);

  // Verify connection
  const shop = await api('GET', '/shop.json');
  console.log(`\n✅  Connected to: "${shop.shop.name}" (${shop.shop.myshopify_domain})`);

  await updateShopName();
  await createCollections();
  await createPages();

  console.log('\n🎉  Setup complete!\n');
  console.log('Next steps:');
  console.log('  1. Publish the CLARIVA-HOME theme from: https://lumera-aura.myshopify.com/admin/themes');
  console.log('  2. Add your first products and assign them to collections');
  console.log('  3. Upload hero image in theme editor: https://lumera-aura.myshopify.com/admin/themes/143788933187/editor');
  console.log('  4. Connect Klaviyo for email marketing (Phase 3)');
  console.log('');
}

main().catch(err => {
  console.error('\n❌  Setup failed:', err.message);
  process.exit(1);
});
