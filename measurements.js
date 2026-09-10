/* Vhagar - body measurements + reminders
 * ---------------------------------------------------------------------------
 * Self-contained module. Mounts into #vhagar-measurements. Touches no globals
 * except window.VhagarMeasurements. Safe to load after the rest of the page.
 *
 * Data sources, in order of preference:
 *   1. Supabase (read + write) once VH_CONFIG.supabase is filled in and you
 *      have signed in.
 *   2. health_data.json (read only) as a fallback, so the table and the weight
 *      chart still work while Supabase is paused or you are signed out.
 *
 * Design rules inherited from projects/vhagar/CLAUDE.md:
 *   - Missing data shows as missing. Never interpolate, never invent a number.
 *   - Built for a tired man on a phone at 6am. Big numbers, few words.
 *   - No fake encouragement.
 */
(function () {
    'use strict';

    // -----------------------------------------------------------------------
    // Config
    // -----------------------------------------------------------------------
    var VH_CONFIG = {
        supabase: {
            // Fill these in from Supabase > Project Settings > API.
            // The anon key is safe to publish ONLY because measurements.sql
            // turns on RLS and scopes every policy to auth.uid(). If you ever
            // disable RLS on those tables, this key becomes a public door.
            url: 'https://qndsoluwrotqomckeqvy.supabase.co',
            anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuZHNvbHV3cm90cW9tY2tlcXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NDYzNzAsImV4cCI6MjA4NzAyMjM3MH0.D9tVUS8C0zzEeNxa-DigXRminhhh8PX4-CNWWhfaJa0'
        },
        healthDataUrl: 'health_data.json',
        // Sign-in email for the magic link. Prefilled to save typing at 6am.
        email: 'sunnywithai@gmail.com'
    };

    // -----------------------------------------------------------------------
    // MCOLS - the single definition of what a measurement is.
    // Everything (table headers, charts, form fields, guide) reads from here.
    // Add a row to this array and the whole UI grows a column.
    // -----------------------------------------------------------------------
    var MCOLS = [
        {
            key: 'weight_kg',
            label: 'Weight',
            short: 'Weight',
            unit: 'kg',
            step: 0.1,
            min: 20,
            max: 300,
            decimals: 1,
            colour: '#e5484d',
            // lower is not automatically better - this just picks the arrow colour
            goal: 'down'
        },
        {
            key: 'waist_inches',
            label: 'Waist',
            short: 'Waist',
            unit: 'in',
            step: 0.25,
            min: 10,
            max: 100,
            decimals: 2,
            colour: '#f5a524',
            goal: 'down'
        },
        {
            key: 'hips_inches',
            label: 'Hips',
            short: 'Hips',
            unit: 'in',
            step: 0.25,
            min: 10,
            max: 100,
            decimals: 2,
            colour: '#8e4ec6',
            goal: 'down'
        },
        {
            key: 'chest_inches',
            label: 'Chest',
            short: 'Chest',
            unit: 'in',
            step: 0.25,
            min: 10,
            max: 100,
            decimals: 2,
            colour: '#0091ff',
            goal: 'up'
        },
        {
            key: 'arm_inches',
            label: 'Right Arm',
            short: 'R. Arm',
            unit: 'in',
            step: 0.25,
            min: 5,
            max: 40,
            decimals: 2,
            colour: '#30a46c',
            goal: 'up'
        },
        {
            key: 'quad_inches',
            label: 'Right Quad',
            short: 'R. Quad',
            unit: 'in',
            step: 0.25,
            min: 5,
            max: 50,
            decimals: 2,
            colour: '#12a594',
            goal: 'up'
        },
        {
            key: 'calf_inches',
            label: 'Right Calf',
            short: 'R. Calf',
            unit: 'in',
            step: 0.25,
            min: 5,
            max: 40,
            decimals: 2,
            colour: '#e93d82',
            goal: 'up'
        }
    ];

    var CATEGORIES = ['health', 'workout', 'nutrition', 'other'];

    // -----------------------------------------------------------------------
    // Guide content. Keyed by MCOLS key.
    // -----------------------------------------------------------------------
    var GUIDE = {
        weight_kg: {
            how: [
                'First thing in the morning, after the loo, before food or water.',
                'Same scale, same spot on the floor, no clothes or the same clothes every time.',
                'Feet flat, weight even, stand still until the number settles.'
            ],
            mistakes: [
                'Weighing at different times of day. A full stomach and a litre of water is over a kilo.',
                'Moving the scale between weigh-ins. Carpet reads differently from tile.',
                'Reacting to a single reading. Day-to-day swing is mostly water and gut contents.'
            ],
            tip: 'Weigh daily if you like, but judge on the 7-day average. A 0.5 kg jump overnight is not fat.'
        },
        waist_inches: {
            how: [
                'Stand relaxed, feet together, arms at your sides.',
                'Find the narrowest point between the bottom rib and the top of the hip bone. For most people that is roughly at the navel.',
                'Tape parallel to the floor, snug enough to stay put without denting the skin.',
                'Breathe out normally and read at the end of the exhale.'
            ],
            mistakes: [
                'Sucking in. It feels like progress and measures nothing.',
                'Pulling the tape tight. Compressing soft tissue can hide a full inch.',
                'Tape angled down at the back. Check in a mirror or feel that it is level all the way round.'
            ],
            tip: 'Waist is the single most useful number here. It moves when body composition moves, even on weeks the scale sits still.'
        },
        hips_inches: {
            how: [
                'Feet together, weight even on both legs.',
                'Measure around the widest part of the buttocks, not the hip bones.',
                'Tape level all the way round, light contact only.'
            ],
            mistakes: [
                'Measuring at the hip bone instead of the widest point - a different spot every time.',
                'Standing with feet apart, which flattens the glutes and shrinks the reading.',
                'Measuring over jeans or thick fabric.'
            ],
            tip: 'Paired with waist this gives you a waist-to-hip ratio, which tracks better than either number on its own.'
        },
        chest_inches: {
            how: [
                'Arms relaxed at your sides, not flexed, not held out.',
                'Tape around the fullest part of the chest, level with the nipples, under the armpits.',
                'Read at the end of a normal exhale.'
            ],
            mistakes: [
                'Holding a big breath. Adds two inches of nothing.',
                'Flaring the lats to look wider.',
                'Tape riding up at the back - it slips under the shoulder blades easily.'
            ],
            tip: 'Get someone else to read the number at the back if you can. Self-measuring the chest is where the tape slips most.'
        },
        arm_inches: {
            how: [
                'Right arm every time, so the numbers are comparable.',
                'Arm relaxed and hanging, or flexed - pick one and never switch. Note which you chose.',
                'Measure at the midpoint between shoulder and elbow, the fullest part of the bicep.',
                'Tape perpendicular to the bone, not angled.'
            ],
            mistakes: [
                'Alternating between flexed and relaxed. That difference is bigger than a year of training.',
                'Measuring a different point up the arm each time.',
                'Measuring straight after arm training - the pump adds up to half an inch that is gone by evening.'
            ],
            tip: 'Cold and relaxed is the honest measurement. Flexed is fine too, but only if it is always flexed.'
        },
        quad_inches: {
            how: [
                'Stand upright, weight even on both feet, muscle relaxed.',
                'Measure the right thigh at its fullest point, usually a hand-width above the top of the kneecap.',
                'Mark the distance from the kneecap so you find the same spot next time.'
            ],
            mistakes: [
                'Shifting weight onto the leg being measured, which flexes it.',
                'Measuring at a different height up the leg each time. This is the biggest source of noise on quads.',
                'Sitting down to measure.'
            ],
            tip: 'Write down the distance above the kneecap once - say 8 inches - and reuse it forever. That single number kills most of the variance.'
        },
        calf_inches: {
            how: [
                'Standing, weight even, calf relaxed.',
                'Measure the widest part of the right calf.',
                'Tape level, light contact.'
            ],
            mistakes: [
                'Rising onto the toes, which contracts the calf.',
                'Measuring after a long walk or run when the muscle is engorged.',
                'Sitting with the knee bent.'
            ],
            tip: 'Calves move slowly. Do not expect month-to-month change; check this one quarterly.'
        }
    };

    var GENERAL_GUIDE = [
        'Same day of the week, same time of day, same conditions. Consistency beats precision.',
        'Morning, fasted, after the loo, before training.',
        'Use a proper flexible tape, not a builder\'s tape measure.',
        'Take each measurement twice. If the two readings differ by more than a quarter inch, take a third and use the middle one.',
        'Measure fortnightly, not daily. Body measurements move slower than the noise in them.'
    ];

    // -----------------------------------------------------------------------
    // Small helpers
    // -----------------------------------------------------------------------
    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) { n.className = cls; }
        if (text !== undefined && text !== null) { n.textContent = String(text); }
        return n;
    }

    function todayISO() {
        var d = new Date();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + m + '-' + day;
    }

    // Blank, never zero, never interpolated.
    function fmt(value, col) {
        if (value === null || value === undefined || value === '') { return null; }
        var n = Number(value);
        if (!isFinite(n)) { return null; }
        return n.toFixed(col.decimals).replace(/\.?0+$/, function (m) {
            return m.indexOf('.') === 0 ? '' : m;
        });
    }

    function shortDate(iso) {
        var parts = String(iso).split('-');
        if (parts.length !== 3) { return iso; }
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return Number(parts[2]) + ' ' + months[Number(parts[1]) - 1];
    }

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------
    var state = {
        rows: [],          // [{ taken_on, weight_kg, ... , _source }]
        reminders: [],
        supabase: null,    // client, or null
        session: null,
        range: 90,         // days, or 0 for all
        tab: 'track',
        charts: {},
        mountNode: null,
        status: ''
    };

    // -----------------------------------------------------------------------
    // Supabase
    // -----------------------------------------------------------------------
    function supabaseConfigured() {
        return Boolean(VH_CONFIG.supabase.url && VH_CONFIG.supabase.anonKey);
    }

    function initSupabase() {
        if (!supabaseConfigured()) { return null; }
        if (typeof window.supabase === 'undefined' ||
            typeof window.supabase.createClient !== 'function') {
            console.warn('[vhagar] supabase-js not loaded; falling back to health_data.json');
            return null;
        }
        return window.supabase.createClient(
            VH_CONFIG.supabase.url,
            VH_CONFIG.supabase.anonKey,
            { auth: { persistSession: true, autoRefreshToken: true } }
        );
    }

    async function loadSession() {
        if (!state.supabase) { return null; }
        try {
            var res = await state.supabase.auth.getSession();
            state.session = res.data ? res.data.session : null;
        } catch (err) {
            console.warn('[vhagar] session lookup failed', err);
            state.session = null;
        }
        return state.session;
    }

    async function signIn(email) {
        if (!state.supabase) { return { error: 'Supabase is not configured yet.' }; }
        try {
            var res = await state.supabase.auth.signInWithOtp({
                email: email,
                options: { emailRedirectTo: window.location.href }
            });
            if (res.error) { return { error: res.error.message }; }
            return { ok: true };
        } catch (err) {
            return { error: String(err) };
        }
    }

    async function signOut() {
        if (!state.supabase) { return; }
        await state.supabase.auth.signOut();
        state.session = null;
    }

    // -----------------------------------------------------------------------
    // Data loading
    // -----------------------------------------------------------------------
    async function loadFromSupabase() {
        var res = await state.supabase
            .from('measurements')
            .select('*')
            .order('taken_on', { ascending: true });
        if (res.error) { throw new Error(res.error.message); }
        return (res.data || []).map(function (r) {
            r._source = 'supabase';
            return r;
        });
    }

    // Fallback: pull whatever body data already exists in health_data.json.
    // Today that is weight only, but if the export ever grows the other keys
    // this picks them up automatically because it walks MCOLS.
    async function loadFromHealthJson() {
        var res = await fetch(VH_CONFIG.healthDataUrl, { cache: 'no-store' });
        if (!res.ok) { throw new Error('health_data.json returned ' + res.status); }
        var data = await res.json();
        var records = (data && data.records) || [];
        var out = [];
        records.forEach(function (rec) {
            var body = rec.body || {};
            var row = { taken_on: rec.date, _source: 'health_data.json' };
            var any = false;
            MCOLS.forEach(function (c) {
                var v = body[c.key];
                row[c.key] = (v === undefined) ? null : v;
                if (v !== null && v !== undefined) { any = true; }
            });
            if (any) { out.push(row); }
        });
        return out;
    }

    async function loadRows() {
        if (state.supabase && state.session) {
            try {
                state.rows = await loadFromSupabase();
                state.status = '';
                return;
            } catch (err) {
                state.status = 'Supabase read failed (' + err.message +
                               '). Showing health_data.json instead.';
            }
        }
        try {
            state.rows = await loadFromHealthJson();
        } catch (err) {
            state.rows = [];
            state.status = 'No data: ' + err.message;
        }
    }

    async function loadReminders() {
        if (!(state.supabase && state.session)) { state.reminders = []; return; }
        var res = await state.supabase
            .from('reminders')
            .select('*')
            .order('remind_at', { ascending: true });
        if (res.error) {
            state.status = 'Reminders read failed: ' + res.error.message;
            state.reminders = [];
            return;
        }
        state.reminders = res.data || [];
    }

    // -----------------------------------------------------------------------
    // Writes
    // -----------------------------------------------------------------------
    async function saveMeasurement(row) {
        if (!(state.supabase && state.session)) {
            return { error: 'Sign in first - measurements need somewhere to go.' };
        }
        var payload = { user_id: state.session.user.id, taken_on: row.taken_on };
        MCOLS.forEach(function (c) {
            var v = row[c.key];
            payload[c.key] = (v === '' || v === undefined) ? null : v;
        });
        if (row.note) { payload.note = row.note; }

        var res = await state.supabase
            .from('measurements')
            .upsert(payload, { onConflict: 'user_id,taken_on' })
            .select();
        if (res.error) { return { error: res.error.message }; }
        return { ok: true };
    }

    async function deleteMeasurement(id) {
        var res = await state.supabase.from('measurements').delete().eq('id', id);
        if (res.error) { return { error: res.error.message }; }
        return { ok: true };
    }

    async function saveReminder(rem) {
        if (!(state.supabase && state.session)) {
            return { error: 'Sign in first.' };
        }
        var payload = {
            user_id: state.session.user.id,
            name: rem.name,
            remind_at: rem.remind_at,
            category: rem.category || 'other',
            note: rem.note || null,
            active: rem.active !== false
        };
        var q = rem.id
            ? state.supabase.from('reminders').update(payload).eq('id', rem.id)
            : state.supabase.from('reminders').insert(payload);
        var res = await q.select();
        if (res.error) { return { error: res.error.message }; }
        return { ok: true };
    }

    async function deleteReminder(id) {
        var res = await state.supabase.from('reminders').delete().eq('id', id);
        if (res.error) { return { error: res.error.message }; }
        return { ok: true };
    }

    // -----------------------------------------------------------------------
    // Filtering
    // -----------------------------------------------------------------------
    function visibleRows() {
        var rows = state.rows.slice().sort(function (a, b) {
            return a.taken_on < b.taken_on ? -1 : (a.taken_on > b.taken_on ? 1 : 0);
        });
        if (!state.range) { return rows; }
        var cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - state.range);
        var cutIso = cutoff.toISOString().slice(0, 10);
        return rows.filter(function (r) { return r.taken_on >= cutIso; });
    }

    // Latest non-null value for a column, plus the change since the previous
    // non-null one. Returns nulls rather than guessing.
    function latestFor(col) {
        var rows = visibleRows().filter(function (r) {
            return r[col.key] !== null && r[col.key] !== undefined;
        });
        if (!rows.length) { return { value: null, delta: null, date: null }; }
        var last = rows[rows.length - 1];
        var prev = rows.length > 1 ? rows[rows.length - 2] : null;
        return {
            value: Number(last[col.key]),
            delta: prev ? Number(last[col.key]) - Number(prev[col.key]) : null,
            date: last.taken_on
        };
    }

    // -----------------------------------------------------------------------
    // Rendering - shell
    // -----------------------------------------------------------------------
    function render() {
        var mount = state.mountNode;
        if (!mount) { return; }
        mount.innerHTML = '';

        var wrap = el('div', 'vh-m');

        // header
        var head = el('div', 'vh-m-head');
        head.appendChild(el('h2', 'vh-m-title', 'Body measurements'));
        head.appendChild(renderAuthBar());
        wrap.appendChild(head);

        if (state.status) {
            wrap.appendChild(el('div', 'vh-m-status', state.status));
        }

        // tabs
        var tabs = el('div', 'vh-m-tabs');
        [['track', 'Track'], ['progress', 'Progress'], ['guide', 'Guide'],
         ['reminders', 'Reminders']].forEach(function (t) {
            var b = el('button', 'vh-m-tab' + (state.tab === t[0] ? ' is-active' : ''), t[1]);
            b.type = 'button';
            b.setAttribute('aria-selected', state.tab === t[0] ? 'true' : 'false');
            b.addEventListener('click', function () {
                state.tab = t[0];
                render();
            });
            tabs.appendChild(b);
        });
        wrap.appendChild(tabs);

        var body = el('div', 'vh-m-body');
        if (state.tab === 'track')     { body.appendChild(renderTrack()); }
        if (state.tab === 'progress')  { body.appendChild(renderProgress()); }
        if (state.tab === 'guide')     { body.appendChild(renderGuide()); }
        if (state.tab === 'reminders') { body.appendChild(renderReminders()); }
        wrap.appendChild(body);

        mount.appendChild(wrap);

        if (state.tab === 'progress') { drawCharts(); }
    }

    function renderAuthBar() {
        var bar = el('div', 'vh-m-auth');
        if (!supabaseConfigured()) {
            bar.appendChild(el('span', 'vh-m-badge vh-m-badge-warn', 'Read only'));
            bar.appendChild(el('span', 'vh-m-hint',
                'Supabase not configured - fill in VH_CONFIG in measurements.js'));
            return bar;
        }
        if (state.session) {
            bar.appendChild(el('span', 'vh-m-badge vh-m-badge-ok', 'Signed in'));
            var out = el('button', 'vh-m-link', 'Sign out');
            out.type = 'button';
            out.addEventListener('click', async function () {
                await signOut();
                await refresh();
            });
            bar.appendChild(out);
        } else {
            bar.appendChild(el('span', 'vh-m-badge vh-m-badge-warn', 'Signed out'));
            var input = el('input', 'vh-m-input vh-m-input-email');
            input.type = 'email';
            input.value = VH_CONFIG.email;
            input.setAttribute('aria-label', 'Email for sign-in link');
            var btn = el('button', 'vh-m-btn vh-m-btn-sm', 'Email me a link');
            btn.type = 'button';
            btn.addEventListener('click', async function () {
                btn.disabled = true;
                btn.textContent = 'Sending...';
                var r = await signIn(input.value.trim());
                btn.disabled = false;
                btn.textContent = 'Email me a link';
                state.status = r.error ? r.error : 'Link sent. Check your inbox.';
                render();
            });
            bar.appendChild(input);
            bar.appendChild(btn);
        }
        return bar;
    }

    function renderRangeFilter() {
        var bar = el('div', 'vh-m-range');
        bar.appendChild(el('span', 'vh-m-range-label', 'Range'));
        [[30, '30d'], [90, '90d'], [180, '6m'], [365, '1y'], [0, 'All']]
            .forEach(function (r) {
                var b = el('button',
                    'vh-m-chip' + (state.range === r[0] ? ' is-active' : ''), r[1]);
                b.type = 'button';
                b.addEventListener('click', function () {
                    state.range = r[0];
                    render();
                });
                bar.appendChild(b);
            });
        return bar;
    }

    // -----------------------------------------------------------------------
    // Tab: Track
    // -----------------------------------------------------------------------
    function renderTrack() {
        var box = el('div');
        box.appendChild(renderEntryForm());
        box.appendChild(renderRangeFilter());
        box.appendChild(renderSummary());

        var rows = visibleRows().slice().reverse(); // newest first in the table

        if (!rows.length) {
            box.appendChild(el('p', 'vh-m-empty',
                'No measurements in this range. Add one above.'));
            return box;
        }

        var scroller = el('div', 'vh-m-scroll');
        var table = el('table', 'vh-m-table');

        var thead = el('thead');
        var hr = el('tr');
        hr.appendChild(el('th', 'vh-m-th-date', 'Date'));
        MCOLS.forEach(function (c) {
            var th = el('th', null, c.short);
            th.title = c.label + ' (' + c.unit + ')';
            hr.appendChild(th);
        });
        if (state.session) { hr.appendChild(el('th', 'vh-m-th-act', '')); }
        thead.appendChild(hr);
        table.appendChild(thead);

        var tbody = el('tbody');
        rows.forEach(function (r) {
            var tr = el('tr');
            tr.appendChild(el('td', 'vh-m-td-date', shortDate(r.taken_on)));
            MCOLS.forEach(function (c) {
                var v = fmt(r[c.key], c);
                var td = el('td', v === null ? 'vh-m-td vh-m-na' : 'vh-m-td');
                td.textContent = v === null ? '—' : v;
                if (v !== null) { td.title = c.label + ': ' + v + ' ' + c.unit; }
                tr.appendChild(td);
            });
            if (state.session) {
                var act = el('td', 'vh-m-td-act');
                if (r.id) {
                    var del = el('button', 'vh-m-icon', '×');
                    del.type = 'button';
                    del.title = 'Delete ' + r.taken_on;
                    del.addEventListener('click', async function () {
                        if (!window.confirm('Delete the entry for ' + r.taken_on + '?')) { return; }
                        var res = await deleteMeasurement(r.id);
                        if (res.error) { state.status = res.error; render(); return; }
                        await refresh();
                    });
                    act.appendChild(del);
                }
                tr.appendChild(act);
            }
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        scroller.appendChild(table);
        box.appendChild(scroller);

        var src = rows[0] && rows[0]._source;
        if (src === 'health_data.json') {
            box.appendChild(el('p', 'vh-m-note',
                'Showing weight from health_data.json. Sign in to see and add the full set.'));
        }
        return box;
    }

    function renderSummary() {
        var grid = el('div', 'vh-m-summary');
        MCOLS.forEach(function (c) {
            var s = latestFor(c);
            var card = el('div', 'vh-m-card');
            card.appendChild(el('div', 'vh-m-card-label', c.label));
            var val = el('div', 'vh-m-card-value');
            if (s.value === null) {
                val.textContent = '—';
                val.classList.add('vh-m-na');
            } else {
                val.textContent = fmt(s.value, c);
                val.appendChild(el('span', 'vh-m-card-unit', ' ' + c.unit));
            }
            card.appendChild(val);
            if (s.delta !== null && Math.abs(s.delta) > 0.001) {
                var good = (c.goal === 'down') ? s.delta < 0 : s.delta > 0;
                var d = el('div', 'vh-m-card-delta ' + (good ? 'is-good' : 'is-bad'),
                    (s.delta > 0 ? '+' : '') + s.delta.toFixed(c.decimals) + ' ' + c.unit);
                card.appendChild(d);
            } else if (s.date) {
                card.appendChild(el('div', 'vh-m-card-delta', shortDate(s.date)));
            }
            grid.appendChild(card);
        });
        return grid;
    }

    function renderEntryForm() {
        var form = el('form', 'vh-m-form');

        var top = el('div', 'vh-m-form-row');
        var dateWrap = el('label', 'vh-m-field');
        dateWrap.appendChild(el('span', 'vh-m-field-label', 'Date'));
        var date = el('input', 'vh-m-input');
        date.type = 'date';
        date.value = todayISO();
        date.required = true;
        dateWrap.appendChild(date);
        top.appendChild(dateWrap);
        form.appendChild(top);

        var grid = el('div', 'vh-m-form-grid');
        var inputs = {};
        MCOLS.forEach(function (c) {
            var f = el('label', 'vh-m-field');
            f.appendChild(el('span', 'vh-m-field-label', c.label + ' (' + c.unit + ')'));
            var i = el('input', 'vh-m-input');
            i.type = 'number';
            i.step = String(c.step);
            i.min = String(c.min);
            i.max = String(c.max);
            i.inputMode = 'decimal';
            i.placeholder = '—';
            inputs[c.key] = i;
            f.appendChild(i);
            grid.appendChild(f);
        });
        form.appendChild(grid);

        var actions = el('div', 'vh-m-form-actions');
        var save = el('button', 'vh-m-btn', 'Save measurement');
        save.type = 'submit';
        if (!state.session) {
            save.disabled = true;
            save.title = 'Sign in to save';
        }
        actions.appendChild(save);
        var msg = el('span', 'vh-m-form-msg');
        actions.appendChild(msg);
        form.appendChild(actions);

        form.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            var row = { taken_on: date.value };
            var any = false;
            MCOLS.forEach(function (c) {
                var raw = inputs[c.key].value;
                if (raw === '') { row[c.key] = null; return; }
                row[c.key] = Number(raw);
                any = true;
            });
            if (!any) {
                msg.textContent = 'Nothing to save - fill in at least one field.';
                return;
            }
            save.disabled = true;
            msg.textContent = 'Saving...';
            var res = await saveMeasurement(row);
            save.disabled = false;
            if (res.error) { msg.textContent = res.error; return; }
            msg.textContent = 'Saved.';
            MCOLS.forEach(function (c) { inputs[c.key].value = ''; });
            await refresh();
        });

        return form;
    }

    // -----------------------------------------------------------------------
    // Tab: Progress
    // -----------------------------------------------------------------------
    function renderProgress() {
        var box = el('div');
        box.appendChild(renderRangeFilter());

        if (typeof window.Chart === 'undefined') {
            box.appendChild(el('p', 'vh-m-empty',
                'Chart.js did not load, so the charts are missing. The Track tab still works.'));
            return box;
        }

        var rows = visibleRows();
        var grid = el('div', 'vh-m-charts');
        MCOLS.forEach(function (c) {
            var has = rows.some(function (r) {
                return r[c.key] !== null && r[c.key] !== undefined;
            });
            var cell = el('div', 'vh-m-chart-cell');
            cell.appendChild(el('div', 'vh-m-chart-title', c.label + ' (' + c.unit + ')'));
            if (!has) {
                cell.appendChild(el('div', 'vh-m-chart-empty', 'No data in this range'));
            } else {
                var cv = el('canvas', 'vh-m-canvas');
                cv.id = 'vh-chart-' + c.key;
                cell.appendChild(cv);
            }
            grid.appendChild(cell);
        });
        box.appendChild(grid);
        return box;
    }

    function drawCharts() {
        var rows = visibleRows();
        Object.keys(state.charts).forEach(function (k) {
            try { state.charts[k].destroy(); } catch (e) { /* already gone */ }
        });
        state.charts = {};

        MCOLS.forEach(function (c) {
            var cv = document.getElementById('vh-chart-' + c.key);
            if (!cv) { return; }

            var points = rows.map(function (r) {
                var v = r[c.key];
                return {
                    x: r.taken_on,
                    // null keeps the gap visible instead of drawing a straight
                    // line through days that were never measured
                    y: (v === null || v === undefined) ? null : Number(v)
                };
            });

            state.charts[c.key] = new window.Chart(cv.getContext('2d'), {
                type: 'line',
                data: {
                    labels: points.map(function (p) { return shortDate(p.x); }),
                    datasets: [{
                        label: c.label,
                        data: points.map(function (p) { return p.y; }),
                        borderColor: c.colour,
                        backgroundColor: c.colour + '22',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        tension: 0.25,
                        spanGaps: false,   // missing shows as missing
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { intersect: false, mode: 'index' },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function (ctx) {
                                    if (ctx.parsed.y === null) { return 'No data'; }
                                    return ctx.parsed.y + ' ' + c.unit;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { grid: { display: false },
                             ticks: { maxTicksLimit: 6, autoSkip: true } },
                        y: { beginAtZero: false,
                             grid: { color: 'rgba(128,128,128,0.15)' },
                             ticks: { maxTicksLimit: 5 } }
                    }
                }
            });
        });
    }

    // -----------------------------------------------------------------------
    // Tab: Guide
    // -----------------------------------------------------------------------
    function renderGuide() {
        var box = el('div', 'vh-m-guide');

        var gen = el('section', 'vh-m-guide-general');
        gen.appendChild(el('h3', 'vh-m-guide-h', 'Every time, without exception'));
        var gl = el('ul', 'vh-m-list');
        GENERAL_GUIDE.forEach(function (t) { gl.appendChild(el('li', null, t)); });
        gen.appendChild(gl);
        box.appendChild(gen);

        MCOLS.forEach(function (c) {
            var g = GUIDE[c.key];
            if (!g) { return; }
            var sec = el('section', 'vh-m-guide-item');

            var h = el('button', 'vh-m-guide-toggle');
            h.type = 'button';
            var dot = el('span', 'vh-m-guide-dot');
            dot.style.background = c.colour;
            h.appendChild(dot);
            h.appendChild(el('span', 'vh-m-guide-name', c.label));
            h.appendChild(el('span', 'vh-m-guide-unit', c.unit));
            sec.appendChild(h);

            var panel = el('div', 'vh-m-guide-panel');
            panel.hidden = true;

            panel.appendChild(el('h4', 'vh-m-guide-sub', 'How'));
            var how = el('ol', 'vh-m-list');
            g.how.forEach(function (t) { how.appendChild(el('li', null, t)); });
            panel.appendChild(how);

            panel.appendChild(el('h4', 'vh-m-guide-sub', 'Common mistakes'));
            var mis = el('ul', 'vh-m-list vh-m-list-warn');
            g.mistakes.forEach(function (t) { mis.appendChild(el('li', null, t)); });
            panel.appendChild(mis);

            var tip = el('p', 'vh-m-guide-tip');
            tip.appendChild(el('strong', null, 'Pro tip: '));
            tip.appendChild(document.createTextNode(g.tip));
            panel.appendChild(tip);

            h.addEventListener('click', function () {
                panel.hidden = !panel.hidden;
                h.classList.toggle('is-open', !panel.hidden);
            });

            sec.appendChild(panel);
            box.appendChild(sec);
        });

        return box;
    }

    // -----------------------------------------------------------------------
    // Tab: Reminders
    // -----------------------------------------------------------------------
    function renderReminders() {
        var box = el('div', 'vh-m-reminders');

        if (!(state.supabase && state.session)) {
            box.appendChild(el('p', 'vh-m-empty',
                'Reminders need a signed-in Supabase session. Sign in above.'));
            return box;
        }

        box.appendChild(reminderForm(null));

        if (!state.reminders.length) {
            box.appendChild(el('p', 'vh-m-empty', 'No reminders yet.'));
            return box;
        }

        var list = el('div', 'vh-m-rem-list');
        state.reminders.forEach(function (r) {
            var item = el('div', 'vh-m-rem' + (r.active ? '' : ' is-off'));

            var main = el('div', 'vh-m-rem-main');
            main.appendChild(el('span', 'vh-m-rem-time', String(r.remind_at).slice(0, 5)));
            main.appendChild(el('span', 'vh-m-rem-name', r.name));
            main.appendChild(el('span', 'vh-m-rem-cat vh-m-cat-' + r.category, r.category));
            item.appendChild(main);

            if (r.note) { item.appendChild(el('div', 'vh-m-rem-note', r.note)); }

            var acts = el('div', 'vh-m-rem-acts');

            var toggle = el('button', 'vh-m-link', r.active ? 'Pause' : 'Resume');
            toggle.type = 'button';
            toggle.addEventListener('click', async function () {
                var res = await saveReminder({
                    id: r.id, name: r.name, remind_at: r.remind_at,
                    category: r.category, note: r.note, active: !r.active
                });
                if (res.error) { state.status = res.error; render(); return; }
                await refresh();
            });
            acts.appendChild(toggle);

            var edit = el('button', 'vh-m-link', 'Edit');
            edit.type = 'button';
            edit.addEventListener('click', function () {
                item.replaceWith(reminderForm(r));
            });
            acts.appendChild(edit);

            var del = el('button', 'vh-m-link vh-m-link-danger', 'Delete');
            del.type = 'button';
            del.addEventListener('click', async function () {
                if (!window.confirm('Delete "' + r.name + '"?')) { return; }
                var res = await deleteReminder(r.id);
                if (res.error) { state.status = res.error; render(); return; }
                await refresh();
            });
            acts.appendChild(del);

            item.appendChild(acts);
            list.appendChild(item);
        });
        box.appendChild(list);
        return box;
    }

    function reminderForm(existing) {
        var form = el('form', 'vh-m-form vh-m-rem-form');

        var grid = el('div', 'vh-m-rem-grid');

        var nameF = el('label', 'vh-m-field');
        nameF.appendChild(el('span', 'vh-m-field-label', 'Name'));
        var name = el('input', 'vh-m-input');
        name.type = 'text';
        name.required = true;
        name.maxLength = 120;
        name.placeholder = 'Take creatine';
        name.value = existing ? existing.name : '';
        nameF.appendChild(name);
        grid.appendChild(nameF);

        var timeF = el('label', 'vh-m-field');
        timeF.appendChild(el('span', 'vh-m-field-label', 'Time'));
        var time = el('input', 'vh-m-input');
        time.type = 'time';
        time.required = true;
        time.value = existing ? String(existing.remind_at).slice(0, 5) : '07:00';
        timeF.appendChild(time);
        grid.appendChild(timeF);

        var catF = el('label', 'vh-m-field');
        catF.appendChild(el('span', 'vh-m-field-label', 'Category'));
        var cat = el('select', 'vh-m-input');
        CATEGORIES.forEach(function (c) {
            var o = el('option', null, c.charAt(0).toUpperCase() + c.slice(1));
            o.value = c;
            if (existing && existing.category === c) { o.selected = true; }
            cat.appendChild(o);
        });
        catF.appendChild(cat);
        grid.appendChild(catF);

        form.appendChild(grid);

        var noteF = el('label', 'vh-m-field vh-m-field-wide');
        noteF.appendChild(el('span', 'vh-m-field-label', 'Note'));
        var note = el('textarea', 'vh-m-input vh-m-textarea');
        note.rows = 2;
        note.maxLength = 500;
        note.placeholder = 'Optional';
        note.value = existing && existing.note ? existing.note : '';
        noteF.appendChild(note);
        form.appendChild(noteF);

        var acts = el('div', 'vh-m-form-actions');
        var save = el('button', 'vh-m-btn', existing ? 'Update' : 'Add reminder');
        save.type = 'submit';
        acts.appendChild(save);
        if (existing) {
            var cancel = el('button', 'vh-m-link', 'Cancel');
            cancel.type = 'button';
            cancel.addEventListener('click', function () { render(); });
            acts.appendChild(cancel);
        }
        var msg = el('span', 'vh-m-form-msg');
        acts.appendChild(msg);
        form.appendChild(acts);

        form.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            save.disabled = true;
            msg.textContent = 'Saving...';
            var res = await saveReminder({
                id: existing ? existing.id : null,
                name: name.value.trim(),
                remind_at: time.value,
                category: cat.value,
                note: note.value.trim() || null,
                active: existing ? existing.active : true
            });
            save.disabled = false;
            if (res.error) { msg.textContent = res.error; return; }
            await refresh();
        });

        return form;
    }

    // -----------------------------------------------------------------------
    // Boot
    // -----------------------------------------------------------------------
    async function refresh() {
        await loadRows();
        await loadReminders();
        render();
    }

    async function mount(selector) {
        state.mountNode = document.querySelector(selector || '#vhagar-measurements');
        if (!state.mountNode) {
            console.warn('[vhagar] mount point not found:', selector);
            return;
        }
        state.supabase = initSupabase();
        if (state.supabase) {
            await loadSession();
            state.supabase.auth.onAuthStateChange(function (_evt, session) {
                state.session = session;
                refresh();
            });
        }
        await refresh();
    }

    window.VhagarMeasurements = {
        mount: mount,
        refresh: refresh,
        config: VH_CONFIG,
        MCOLS: MCOLS
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { mount(); });
    } else {
        mount();
    }
})();
