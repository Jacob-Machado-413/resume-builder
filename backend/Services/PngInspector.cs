using System.Buffers.Binary;
using System.IO.Compression;

namespace ResumeBuilder.Api.Services;

public record PngInk(int Width, int Height, int FirstInkRow, int LastInkRow);

/// <summary>
/// Minimal PNG decoder (8-bit, non-interlaced) that reports which rows contain ink.
/// It exists so the page-fill estimate needs no native imaging library.
/// </summary>
public static class PngInspector
{
    private static readonly byte[] Signature = [137, 80, 78, 71, 13, 10, 26, 10];

    public static PngInk? Inspect(string path)
    {
        try
        {
            return Inspect(File.ReadAllBytes(path));
        }
        catch
        {
            return null;
        }
    }

    public static PngInk? Inspect(byte[] data)
    {
        if (data.Length < 8 || !data.AsSpan(0, 8).SequenceEqual(Signature)) return null;

        int width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
        byte[]? palette = null;
        using var idat = new MemoryStream();
        var pos = 8;
        while (pos + 8 <= data.Length)
        {
            var len = (int)BinaryPrimitives.ReadUInt32BigEndian(data.AsSpan(pos));
            var type = System.Text.Encoding.ASCII.GetString(data, pos + 4, 4);
            var body = data.AsSpan(pos + 8, len);
            switch (type)
            {
                case "IHDR":
                    width = (int)BinaryPrimitives.ReadUInt32BigEndian(body);
                    height = (int)BinaryPrimitives.ReadUInt32BigEndian(body[4..]);
                    bitDepth = body[8];
                    colorType = body[9];
                    interlace = body[12];
                    break;
                case "PLTE":
                    palette = body.ToArray();
                    break;
                case "IDAT":
                    idat.Write(body);
                    break;
            }

            if (type == "IEND") break;
            pos += 12 + len;
        }

        if (bitDepth != 8 || interlace != 0 || width == 0) return null;
        var channels = colorType switch { 0 => 1, 2 => 3, 3 => 1, 4 => 2, 6 => 4, _ => 0 };
        if (channels == 0) return null;

        idat.Position = 0;
        using var z = new ZLibStream(idat, CompressionMode.Decompress);
        var stride = width * channels;
        var prev = new byte[stride];
        var cur = new byte[stride];
        int first = -1, last = -1;

        for (var y = 0; y < height; y++)
        {
            var filter = z.ReadByte();
            if (filter < 0) break;
            z.ReadExactly(cur);
            Unfilter(filter, cur, prev, channels);

            if (RowHasInk(cur, width, channels, colorType, palette))
            {
                if (first < 0) first = y;
                last = y;
            }

            (prev, cur) = (cur, prev);
        }

        return new PngInk(width, height, first, last);
    }

    private static void Unfilter(int filter, byte[] cur, byte[] prev, int bpp)
    {
        for (var i = 0; i < cur.Length; i++)
        {
            int a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
            cur[i] = filter switch
            {
                1 => (byte)(cur[i] + a),
                2 => (byte)(cur[i] + b),
                3 => (byte)(cur[i] + ((a + b) >> 1)),
                4 => (byte)(cur[i] + Paeth(a, b, c)),
                _ => cur[i],
            };
        }
    }

    private static int Paeth(int a, int b, int c)
    {
        int p = a + b - c, pa = Math.Abs(p - a), pb = Math.Abs(p - b), pc = Math.Abs(p - c);
        return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }

    /// <summary>A pixel counts as ink when, composited on white, it is noticeably darker than the paper.</summary>
    private static bool RowHasInk(byte[] row, int width, int channels, int colorType, byte[]? palette)
    {
        var dark = 0;
        for (var x = 0; x < width; x++)
        {
            var o = x * channels;
            int lum, alpha = 255;
            switch (colorType)
            {
                case 0: lum = row[o]; break;
                case 4: lum = row[o]; alpha = row[o + 1]; break;
                case 3:
                    var idx = row[o] * 3;
                    lum = palette is not null && idx + 2 < palette.Length ? (palette[idx] + palette[idx + 1] + palette[idx + 2]) / 3 : 255;
                    break;
                case 6: lum = (row[o] * 30 + row[o + 1] * 59 + row[o + 2] * 11) / 100; alpha = row[o + 3]; break;
                default: lum = (row[o] * 30 + row[o + 1] * 59 + row[o + 2] * 11) / 100; break;
            }

            var onWhite = 255 - alpha * (255 - lum) / 255;
            if (onWhite < 225 && ++dark >= 2) return true;
        }

        return false;
    }
}
