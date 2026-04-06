#!/usr/bin/env node
/**
 * Generate 10,000 seed-to-word mappings for Wordle.
 * Each seed is a unique 6-digit number (100000-999999).
 * Words are drawn randomly from the SOLUTIONS list.
 * Output is XOR-encrypted + base64-encoded for embedding in HTML.
 */

const SOLUTIONS = [
    "about", "above", "abuse", "actor", "acute", "admit", "adopt", "adult", "after", "again",
    "agent", "agree", "ahead", "alarm", "album", "alert", "alien", "align", "alike", "alive",
    "alley", "allow", "alone", "along", "alter", "among", "amuse", "angel", "anger", "angle",
    "angry", "anime", "ankle", "annex", "antic", "apart", "apple", "apply", "arena", "argue",
    "arise", "armor", "aroma", "aside", "asset", "attic", "audio", "audit", "avoid", "awake",
    "award", "aware", "awful", "bacon", "badge", "badly", "bagel", "baker", "bases", "basic",
    "basin", "basis", "batch", "beach", "beard", "beast", "began", "begin", "being", "bench",
    "berry", "bible", "bikes", "birth", "black", "blade", "blame", "bland", "blank", "blast",
    "blaze", "bleak", "bleed", "blend", "bless", "blind", "bliss", "block", "blond", "blood",
    "bloom", "blown", "blues", "bluff", "blunt", "blurt", "board", "boast", "bonus", "boost",
    "booth", "bound", "boxer", "brain", "brand", "brave", "bread", "break", "breed", "brick",
    "bride", "brief", "bring", "broad", "broke", "brook", "brown", "brush", "buddy", "build",
    "built", "bunch", "burst", "buyer", "cabin", "cable", "camel", "candy", "cargo", "carry",
    "catch", "cater", "cause", "cease", "chain", "chair", "chalk", "chant", "chaos", "charm",
    "chart", "chase", "cheap", "cheat", "check", "cheek", "cheer", "chess", "chest", "chick",
    "chief", "child", "chill", "choir", "chord", "chose", "chunk", "churn", "civic", "civil",
    "claim", "clamp", "clash", "class", "clean", "clear", "click", "cliff", "climb", "cling",
    "clock", "clone", "close", "cloth", "cloud", "clown", "clubs", "cluck", "clump", "clung",
    "coach", "coast", "comet", "comic", "coral", "count", "couch", "could", "court", "cover",
    "crack", "craft", "crane", "crash", "crazy", "cream", "creep", "crews", "crime", "crisp",
    "cross", "crowd", "crown", "crude", "crush", "curve", "cycle", "daddy", "daily", "dairy",
    "dance", "dated", "dealt", "death", "debug", "debut", "decay", "decor", "decoy", "delay",
    "delta", "dense", "depth", "derby", "desks", "detox", "devil", "diary", "dirty", "disco",
    "dizzy", "dodge", "doing", "donor", "doubt", "dough", "draft", "drain", "drama", "drank",
    "drape", "drawn", "dread", "dream", "dress", "dried", "drift", "drill", "drink", "drive",
    "drops", "drove", "drown", "drums", "drunk", "dryer", "dwell", "dying", "eager", "early",
    "earth", "eater", "edges", "eight", "elder", "elect", "elite", "email", "ember", "empty",
    "ended", "enemy", "enjoy", "enter", "entry", "equal", "equip", "error", "essay", "ethic",
    "evade", "event", "every", "exact", "exams", "exert", "exile", "exist", "extra", "fable",
    "faced", "facts", "fairy", "faith", "falls", "false", "fancy", "fatal", "fault", "feast",
    "fella", "fence", "ferry", "fetch", "fever", "fewer", "fiber", "field", "fiery", "fifty",
    "fight", "filed", "final", "finds", "first", "fixed", "flame", "flash", "flask", "fleet",
    "flesh", "flies", "fling", "flint", "float", "flock", "flood", "floor", "flora", "flour",
    "flown", "fluid", "fluke", "flung", "flush", "flute", "focal", "focus", "folly", "force",
    "forge", "forth", "forum", "found", "foxes", "frame", "frank", "fraud", "fresh", "front",
    "frost", "froze", "fruit", "fungi", "funny", "forte", "ghost", "giant", "given", "glare",
    "glass", "gleam", "glide", "globe", "gloom", "glory", "gloss", "glove", "glyph", "going",
    "grace", "grade", "grain", "grand", "grant", "graph", "grasp", "grass", "grave",
    "great", "greed", "green", "greet", "grief", "grill", "grind", "groan", "groom", "gross",
    "group", "grove", "grown", "guard", "guess", "guest", "guide", "guild", "guilt", "guise",
    "gulch", "gummy", "gypsy", "habit", "hairy", "happy", "harsh", "haste", "haunt", "haven",
    "heart", "heavy", "hedge", "hefty", "hello", "hence", "herbs", "hinge", "hippo", "hobby",
    "homer", "honey", "honor", "hoped", "horse", "hotel", "hound", "house", "hover", "human",
    "humid", "humor", "hurry", "ideal", "image", "imply", "inbox", "index", "indie", "infer",
    "inner", "input", "intro", "irony", "ivory", "jeans", "jewel", "joker", "jolly", "joust",
    "judge", "juice", "juicy", "jumbo", "kebab", "knack", "knead", "kneel", "knelt",
    "knife", "knock", "known", "label", "labor", "lance", "large", "laser", "later", "laugh",
    "layer", "leads", "leapt", "learn", "lease", "least", "leave", "legal", "lemon", "level",
    "lever", "light", "liked", "limit", "linen", "liner", "links", "lions", "lived", "liver",
    "llama", "lobby", "local", "lodge", "lofty", "logic", "loose", "lotus", "loved",
    "lover", "lower", "loyal", "lucid", "lucky", "lunar", "lunch", "lured", "lying", "lyric",
    "magic", "major", "maker", "manor", "maple", "march", "marry", "marsh", "masks", "match",
    "maybe", "mayor", "medal", "media", "mercy", "merge", "merit", "merry", "metal", "meter",
    "might", "mills", "mimic", "miner", "minor", "minus", "mirth", "mixed", "model", "modem",
    "money", "month", "moral", "motel", "motor", "mound", "mount", "mourn", "mouse", "mouth",
    "moved", "mover", "movie", "muddy", "mural", "music", "naive", "nasty", "naval", "nerve",
    "never", "newly", "nexus", "niche", "night", "noble", "noise", "north", "noted", "novel",
    "nudge", "nurse", "nylon", "oasis", "occur", "ocean", "olive", "onset", "opera", "orbit",
    "order", "organ", "other", "ought", "outer", "owner", "oxide", "ozone", "paint", "pairs",
    "panel", "panic", "paper", "party", "pasta", "paste", "patch", "pause", "peace", "peach",
    "pearl", "pedal", "penny", "perch", "peril", "perks", "phase", "phone", "photo", "piano",
    "picky", "piece", "pilot", "pinch", "pitch", "pixel", "pizza", "place", "plain", "plane",
    "plant", "plate", "plaza", "plead", "pluck", "plumb", "plump", "poems", "point",
    "polar", "porch", "posed", "power", "press", "price", "pride", "prime", "print", "prior",
    "probe", "prone", "proof", "prose", "proud", "prove", "proxy", "prune", "pulse", "punch",
    "pupil", "puppy", "purse", "queen", "query", "quest", "queue", "quick", "quiet", "quill",
    "quirk", "quota", "quote", "radar", "radio", "raise", "rally", "ranch", "range", "rapid",
    "raspy", "ratio", "raven", "reach", "react", "reads", "ready", "realm", "rebel", "recap",
    "refer", "reign", "relax", "relay", "renal", "renew", "repay", "rider", "ridge", "rifle",
    "right", "rigid", "risky", "rival", "river", "roast", "robin", "robot", "rocky", "rogue",
    "roman", "roots", "rouge", "rough", "round", "route", "royal", "rugby", "ruins", "ruler",
    "rural", "sadly", "saint", "salad", "salsa", "salty", "sauce", "saved", "scale",
    "scare", "scene", "scent", "scope", "score", "scout", "scrap", "screw", "seize", "sense",
    "serve", "setup", "seven", "shade", "shaft", "shake", "shall", "shame", "shape", "share",
    "shark", "sharp", "sheep", "sheer", "sheet", "shelf", "shell", "shift", "shine", "shirt",
    "shock", "shore", "short", "shout", "shove", "shown", "sided", "siege", "sight", "sigma",
    "since", "sixth", "sixty", "sized", "skill", "skull", "slate", "slave", "sleep", "slice",
    "slide", "slope", "smart", "smell", "smile", "smoke", "snack", "snake", "solar", "solid",
    "solve", "sorry", "sound", "south", "space", "spare", "spark", "speak", "speed", "spell",
    "spend", "spent", "spice", "spill", "spine", "split", "spoke", "spoon", "sport", "squad",
    "stack", "staff", "stage", "stain", "stake", "stale", "stall", "stamp", "stand",
    "stark", "start", "state", "stave", "stays", "steak", "steal", "steam", "steel", "steep",
    "steer", "stern", "stick", "stiff", "still", "sting", "stock", "stole", "stone", "stood",
    "stool", "store", "storm", "story", "stout", "stove", "strap", "straw", "strip", "stuck",
    "study", "stuff", "stump", "stung", "stunt", "style", "sugar", "suite", "sunny", "super",
    "surge", "swamp", "swarm", "swear", "sweat", "sweep", "sweet", "swept", "swift", "swing",
    "swirl", "sword", "swore", "sworn", "swung", "syrup", "table", "taken", "taste", "taxed",
    "teach", "teeth", "tempo", "tense", "terms", "theft", "their", "theme", "there", "thick",
    "thief", "thing", "think", "third", "thorn", "those", "three", "threw", "throw", "thumb",
    "tight", "timer", "tired", "title", "toast", "today", "token", "total", "touch", "tough",
    "towel", "tower", "toxic", "trace", "track", "trade", "trail", "train", "trait", "tramp",
    "trash", "treat", "trend", "trial", "tribe", "trick", "tried", "troop", "truck", "truly",
    "trump", "trunk", "trust", "truth", "tumor", "tuner", "twice", "twist", "tying", "ultra",
    "uncle", "uncut", "under", "undid", "unfit", "union", "unite", "unity", "until", "upper",
    "upset", "urban", "usage", "utter", "vague", "valid", "value", "valve", "vapor",
    "vault", "venue", "verse", "video", "vigor", "viral", "virus", "visit", "visor", "vista",
    "vital", "vivid", "vocal", "vodka", "voice", "voter", "vouch", "vowel", "wagon", "waist",
    "waste", "watch", "water", "waved", "waves", "weary", "weave", "wedge", "weigh", "weird",
    "whale", "wheat", "wheel", "where", "which", "while", "white", "whole", "whose", "wider",
    "widow", "width", "witch", "woman", "world", "worry", "worse", "worst", "worth", "would",
    "wound", "wrath", "wreck", "wrist", "write", "wrote", "yacht", "young", "yours", "youth",
    "zebra", "zones"
];

// Filter to valid 5-letter words only
const validWords = SOLUTIONS.filter(w => /^[a-z]{5}$/.test(w));

// XOR encryption key
const XOR_KEY = 'W0rdl3S33dK3y!2025';

function xorEncrypt(text, key) {
    let result = [];
    for (let i = 0; i < text.length; i++) {
        result.push(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return Buffer.from(result).toString('base64');
}

// Generate 10,000 unique 6-digit seeds
const seeds = new Set();
while (seeds.size < 10000) {
    const seed = 100000 + Math.floor(Math.random() * 900000);
    seeds.add(seed);
}

// Build compact mapping: sorted seeds array + corresponding words string
// Format: "seed1,seed2,...|word1word2word3..." (words are all 5 chars, no separator needed)
const sortedSeeds = Array.from(seeds).sort((a, b) => a - b);
const words = sortedSeeds.map(() => validWords[Math.floor(Math.random() * validWords.length)]);

// Compact format: seeds as comma-separated, words as concatenated 5-char blocks
const payload = sortedSeeds.join(',') + '|' + words.join('');
const encrypted = xorEncrypt(payload, XOR_KEY);

// Save to a temp file for embedding
const fs = require('fs');
const outPath = require('path').join(__dirname, '..', 'wordle', 'seed-data.tmp.js');
const content = `const SEED_KEY = '${XOR_KEY}';\nconst SEED_DATA = '${encrypted}';`;
fs.writeFileSync(outPath, content, 'utf8');
console.log(`Written to ${outPath}`);
console.log(`Data length: ${encrypted.length} chars`);
console.log(`Seeds: ${sortedSeeds.length}, Words: ${words.length}`);
console.log(`Sample: seed ${sortedSeeds[0]} => ${words[0]}, seed ${sortedSeeds[1]} => ${words[1]}`);
