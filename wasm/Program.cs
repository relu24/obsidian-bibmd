// A note's bib blocks in Obsidian, drawn by bibmd's own Bib.cs with bibui: one canvas per
// block, the page's, and all the blocks of a note one program, as in bibmd, so a slider in one
// block moves what another draws. Main does nothing; the page calls Open for each block,
// Update when the note changes, and Close when a block goes away.
using System.Runtime.InteropServices.JavaScript;
using Bibui.Core;
using Bibui.Core.Runtime;
using Bibui.Core.Runtime.Platform;
using Bibui.Core.Theming;
using Bibui.Platform.Browser;
using Bibui.Raster.Managed.Backend;
using Bibui.Text;

[assembly: System.Runtime.Versioning.SupportedOSPlatform("browser")]

namespace BibMd;

public static partial class BibCanvas
{
    public static void Main() { }

    /// <summary>A note with blocks on screen: its text, as bibmd reads it, and its one program.</summary>
    private sealed class Note
    {
        public required string Path;
        public required Document Doc;
        public readonly BibProgram Program = new();
        public readonly HashSet<int> Places = [];
    }

    /// <summary>A canvas: the note it is in, which of its bib blocks it draws, and what draws it.</summary>
    private sealed class Place
    {
        public required Note Note;
        public required int Block;
        public required BibuiRuntime Runtime;
        public required BrowserWindow Window;
        public required Action Wake;
    }

    private static readonly Dictionary<string, Note> Notes = [];
    private static readonly Dictionary<int, Place> Places = [];
    private static int _next, _files;

    /// <summary>
    /// bibui's browser module, from <paramref name="url"/> (the page's, made from the plugin's own
    /// bytes): imported under the name bibui imports it by, so bibui's own import finds it there.
    /// </summary>
    [JSExport]
    public static Task Preload(string url) => JSHost.ImportAsync(BrowserModule, url);

    // The name bibui's browser platform imports its module under (BrowserInterop.ModuleName).
    private const string BrowserModule = "Bibui.Platform.Browser";

    /// <summary>
    /// A font the page read from the system, as base64: registered under
    /// <paramref name="family"/>, which a theme's fonts then name.
    /// </summary>
    [JSExport]
    public static void Font(string family, string base64) =>
        FontRegistry.Register(family, Convert.FromBase64String(base64));

    private static byte[]? _emoji;

    /// <summary>
    /// The emoji face (Twemoji, packed with the plugin): every canvas sets an emoji in it, the
    /// ones open now and the ones opened after.
    /// </summary>
    [JSExport]
    public static void Emoji(byte[] font)
    {
        _emoji = font;
        foreach (var place in Places.Values)
        {
            place.Runtime.Fonts.UseClusterFont(new Bibui.Text.FreeType.FontData(font, "Twemoji"));
            place.Runtime.RequestFrame();
        }
    }

    /// <summary>A font for the characters the note's font and the emoji face lack (an arrow, a math sign).</summary>
    [JSExport]
    public static void Fallback(byte[] font) => FontRegistry.RegisterFallback(font);

    /// <summary>
    /// Draws the <paramref name="block"/>-th bib block of the note at <paramref name="note"/> (its
    /// path in the vault) on <paramref name="canvas"/>, until it is closed. Every canvas of a note
    /// draws from the same program. The canvas is made as tall as the block is, through the
    /// page's <c>bibCanvas.height(canvas, px)</c>. Gives the canvas's id.
    /// </summary>
    [JSExport]
    public static async Task<int> Open(JSObject canvas, string note, string text, int block, string theme)
    {
        int id = _next++;
        var n = NoteFor(note, text);
        var runtime = BibuiRuntime.Create();
        if (_emoji is not null) runtime.Fonts.UseClusterFont(new Bibui.Text.FreeType.FontData(_emoji, "Twemoji"));
        runtime.SetTheme(HostTheme(theme, out bool pointer));
        var window = await BrowserWindow.OpenAsync(canvas);
        runtime.WakeUp = window.Wake;
        runtime.WindowClipboard = (window.GetClipboardText, window.SetClipboardText);
        var place = Places[id] = new Place { Note = n, Block = block, Runtime = runtime, Window = window, Wake = runtime.RequestFrame };
        n.Places.Add(id);
        // What a reader does in any block of the note is drawn by all of them.
        n.Program.Changed += place.Wake;
        var managed = new ManagedRenderer(window.Cpu);
        Bib.Saver = (name, text) => { Download(name, text); return $"Downloaded {name}."; };
        var bib = new Bib(runtime, n.Program);
        float shown = -1f;
        CursorShape? cursor = null;
        bool first = true;

        BrowserWindow.Run(window, () => runtime.FramesRequested > 0, () =>
        {
            runtime.ConsumeFrame();
            var frame = window.Frame;
            // A slider's thumb is centred on its value, so at either end half of it lies past the
            // track. bibmd's page leaves room for it; here the canvas is the note's column, and
            // Live Preview clips its code blocks to that (contain: paint), so the block is inset by
            // half a thumb on each side instead.
            float inset = runtime.Theme.Slider.ThumbSize / 2f;
            float width = frame.Width / frame.Scale - 2f * inset;
            runtime.BeginBuild(frame, window.Events);
            // A fitted box is capped by the room its parent gives it, so the block is laid out in
            // a root far taller than any block, and measured as the column that fits it.
            var root = runtime.BeginParent(runtime.Column());
            root.SizeX = SemanticSize.Pixels(width + 2f * inset);
            root.SizeY = SemanticSize.Pixels(100_000f);
            root.Style.Padding = EdgeInsets.Symmetric(horizontal: inset, vertical: 0f);
            var column = runtime.BeginParent(runtime.Column());
            column.SizeX = SemanticSize.Pixels(width);
            // A note edited since the last frame is a new program, which keeps the reader's values.
            bib.Prepare(place.Note.Doc, 1, width);
            int index = BlockIndex(place.Note.Doc, place.Block);
            if (index < 0 || !bib.View(index, width)) runtime.Text("No such bib block");
            // The keys a block asks for (key(), a button's key:) are the note's, while its canvas has them.
            if (!bib.HasFocus)
                foreach (var ev in runtime.UnconsumedEvents)
                    if (ev.IsKeyDown && bib.Key(ev)) ev.Eat();
            runtime.EndParent(column);
            runtime.EndParent(root);
            runtime.EndBuild();
            // The pointer's shape the build asked for, as the host draws its own: Obsidian shows
            // the arrow over a button unless its "pointer cursor" setting is on.
            var shape = runtime.Cursor == CursorShape.Pointer && !pointer ? CursorShape.Default : runtime.Cursor;
            if (shape != cursor) { cursor = shape; window.SetCursor(shape); }
            // The field that takes typing, if any: the page gives it the keyboard (and an input
            // method its caret), as bibmd's web viewer does.
            window.SetTextInput(runtime.TextInput);
            BrowserWindow.BeginDraw(window);
            managed.Draw(runtime.DrawList);
            BrowserWindow.EndDraw(window);
            // The canvas follows the block's height; a new height is drawn in the next frame.
            float tall = MathF.Ceiling(column.Extent.Y) + 2f;
            if (MathF.Abs(tall - shown) >= 1f)
            {
                shown = tall;
                Height(canvas, tall);
                runtime.RequestFrame();
            }
            if (first) { first = false; Drawn(canvas); }
        });
        return id;
    }

    /// <summary>The note as it is now: every canvas of it draws the new text.</summary>
    [JSExport]
    public static void Update(string note, string text)
    {
        if (!Notes.TryGetValue(note, out var n)) return;
        Write(n, text);
        foreach (int id in n.Places) Places[id].Runtime.RequestFrame();
    }

    /// <summary>Which of its note's bib blocks the canvas draws, when blocks before it came or went.</summary>
    [JSExport]
    public static void Show(int id, int block)
    {
        if (!Places.TryGetValue(id, out var place) || place.Block == block) return;
        place.Block = block;
        place.Runtime.RequestFrame();
    }

    /// <summary>Stops drawing the canvas and forgets it, and the note with its last canvas.</summary>
    [JSExport]
    public static void Close(int id)
    {
        if (!Places.Remove(id, out var place)) return;
        place.Note.Program.Changed -= place.Wake;
        place.Note.Places.Remove(id);
        place.Window.Close();
        if (place.Note.Places.Count > 0) return;
        Notes.Remove(Notes.First(kv => kv.Value == place.Note).Key);
        File.Delete(place.Note.Path);
    }

    private static Note NoteFor(string note, string text)
    {
        if (Notes.TryGetValue(note, out var n))
        {
            if (n.Doc.Text != text) Write(n, text);
            return n;
        }
        // Bib.cs reads a Document, which reads its file: the note goes in the in-memory file system.
        string path = $"/notes/{_files++}.md";
        Directory.CreateDirectory("/notes");
        File.WriteAllText(path, text);
        return Notes[note] = new Note { Path = path, Doc = new Document(path) };
    }

    private static void Write(Note n, string text)
    {
        File.WriteAllText(n.Path, text);
        n.Doc = new Document(n.Path);
    }

    // The document block of the note's block-th bib block, or -1.
    private static int BlockIndex(Document doc, int block)
    {
        for (int i = 0, k = 0; i < doc.Blocks.Count; i++)
        {
            if (doc.Blocks[i].Kind != BlockKind.Code || !Bib.IsBib(doc.Source(doc.Blocks[i]))) continue;
            if (k++ == block) return i;
        }
        return -1;
    }

    /// <summary>
    /// The host page's theme as bibui's: <paramref name="json"/> is {dark, size, pointer, fonts,
    /// colors: {role: "#RRGGBBAA"}}, read from Obsidian's CSS variables. The canvas's background
    /// is transparent, so the note shows through; the type scale is bibui's, scaled so its body
    /// size is the note's; the fonts are the note's, when the page could read them.
    /// </summary>
    private static ThemeTokens HostTheme(string json, out bool pointer)
    {
        using var doc = System.Text.Json.JsonDocument.Parse(json);
        var root = doc.RootElement;
        bool dark = root.GetProperty("dark").GetBoolean();
        pointer = root.TryGetProperty("pointer", out var p) && p.GetBoolean();
        var theme = ThemeRegistry.Load(dark ? "bibui-dark" : "bibui-light");
        var c = theme.Colors with { Mode = dark ? ThemeMode.Dark : ThemeMode.Light };
        string? Family(string slot) => root.TryGetProperty("fonts", out var f) && f.TryGetProperty(slot, out var v) ? v.GetString() : null;
        string? Hex(string role) => root.GetProperty("colors").TryGetProperty(role, out var v) && v.GetString() is { Length: 9 } h ? h : null;
        c = c with
        {
            Background = "#00000000",
            Surface = Hex("surface") ?? c.Surface,
            SurfaceRaised = Hex("raised") ?? c.SurfaceRaised,
            SurfaceRaisedHover = Hex("raisedHover") ?? c.SurfaceRaisedHover,
            SurfaceRaisedActive = Hex("raisedActive") ?? c.SurfaceRaisedActive,
            Border = Hex("border") ?? c.Border,
            BorderHover = Hex("borderHover") ?? c.BorderHover,
            BorderFocus = Hex("borderFocus") ?? c.BorderFocus,
            TextPrimary = Hex("text") ?? c.TextPrimary,
            TextSecondary = Hex("muted") ?? c.TextSecondary,
            TextDisabled = Hex("faint") ?? c.TextDisabled,
            Accent = Hex("accent") ?? c.Accent,
            AccentHover = Hex("accentHover") ?? c.AccentHover,
            AccentActive = Hex("accentHover") ?? c.AccentActive,
            AccentForeground = Hex("onAccent") ?? c.AccentForeground,
            Destructive = Hex("danger") ?? c.Destructive,
            Success = Hex("success") ?? c.Success,
        };
        float md = root.TryGetProperty("size", out var sz) ? (float)sz.GetDouble() : 14f;
        float k = md / theme.Typography.SizeMd;
        var t = theme.Typography;
        var type = new TypographyTokens
        {
            SizeSm = MathF.Round(t.SizeSm * k), SizeMd = md, SizeLg = MathF.Round(t.SizeLg * k),
            SizeXl = MathF.Round(t.SizeXl * k), Size2Xl = MathF.Round(t.Size2Xl * k),
            WeightNormal = t.WeightNormal, WeightSemiBold = t.WeightSemiBold,
            FontFamilyBody = Family("body") ?? t.FontFamilyBody,
            FontFamilyDisplay = Family("body") ?? t.FontFamilyDisplay,
            FontFamilyHeading = Family("body") ?? t.FontFamilyHeading,
            FontFamilyMono = Family("mono") ?? t.FontFamilyMono,
        };
        // The host's text field and slider, through bibui's input and slider tokens.
        float Px(string group, string key, float otherwise) =>
            root.TryGetProperty(group, out var g) && g.TryGetProperty(key, out var v) ? (float)v.GetDouble() : otherwise;
        UiColor Paint(string? hex, UiColor otherwise) => hex is null ? otherwise : UiColor.Hex(hex);
        string? Given(string group, string key) =>
            root.TryGetProperty(group, out var g) && g.TryGetProperty(key, out var v) ? v.GetString() : null;
        var input = new InputTokens
        {
            PaddingX = Px("input", "paddingX", theme.Input.PaddingX),
            PaddingY = Px("input", "paddingY", theme.Input.PaddingY),
            Radius = Px("input", "radius", theme.Input.Radius),
            Fill = Paint(Hex("field"), theme.Input.Fill),
        };
        var slider = new SliderTokens
        {
            GrooveHeight = Px("slider", "grooveHeight", theme.Slider.GrooveHeight),
            ThumbSize = Px("slider", "thumbSize", theme.Slider.ThumbSize),
            Groove = Paint(Hex("track"), theme.Slider.Groove),
            Fill = null,   // Obsidian's track is one colour throughout
            Thumb = Paint(Given("slider", "thumb"), theme.Slider.Thumb),
            ThumbBorder = Paint(Hex("thumbBorder"), theme.Slider.ThumbBorder),
        };
        return theme with { Colors = c, Typography = type, Input = input, Slider = slider };
    }

    [JSImport("globalThis.bibCanvas.height")]
    private static partial void Height(JSObject canvas, double px);

    [JSImport("globalThis.bibCanvas.drawn")]
    private static partial void Drawn(JSObject canvas);

    [JSImport("globalThis.bibCanvas.download")]
    private static partial void Download(string name, string text);
}
