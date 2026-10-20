package nl.mrtherich.guicutter

import android.graphics.Bitmap
import android.graphics.Color
import org.json.JSONObject
import kotlin.math.roundToInt
import kotlin.math.sqrt

/** Color-key processing for exported PNGs. Mirrors transparency.mjs; no source bitmap edits. */
object Transparency {
    fun apply(source: Bitmap, settings: JSONObject?): Bitmap {
        val raw = settings?.optJSONArray("colors") ?: return source
        val palette = (0 until minOf(raw.length(),24)).mapNotNull { index ->
            val value = raw.optString(index)
            if (Regex("#[0-9a-fA-F]{6}").matches(value)) Color.parseColor(value) else null
        }
        if (palette.isEmpty()) return source
        val w=source.width;val h=source.height;val n=w*h
        val pixels=IntArray(n)
        source.getPixels(pixels,0,w,0,0,w,h)
        val erased=BooleanArray(n);val matches=BooleanArray(n)
        val threshold=(settings.optDouble("tolerance",20.0).coerceIn(0.0,100.0)*1.6+0.5)
        fun distance(pixel:Int,color:Int):Double {
            val r=(Color.red(pixel)-Color.red(color)).toDouble()
            val g=(Color.green(pixel)-Color.green(color)).toDouble()
            val b=(Color.blue(pixel)-Color.blue(color)).toDouble()
            return sqrt(.299*r*r+.587*g*g+.114*b*b)
        }
        fun nearest(pixel:Int):Int = palette.indices.minByOrNull { distance(pixel,palette[it]) } ?: 0
        for (i in 0 until n) if (Color.alpha(pixels[i])!=0 && distance(pixels[i],palette[nearest(pixels[i])])<=threshold) matches[i]=true
        if(settings.optBoolean("all",false)){
            for(i in 0 until n)erased[i]=matches[i]
        }else{
            val queue=IntArray(n);var head=0;var tail=0
            fun add(i:Int){if(matches[i]&&!erased[i]){erased[i]=true;queue[tail++]=i}}
            for(x in 0 until w){add(x);add((h-1)*w+x)}
            for(y in 0 until h){add(y*w);add(y*w+w-1)}
            while(head<tail){val i=queue[head++];val x=i%w;val y=i/w
                for(dy in -1..1)for(dx in -1..1){if(dx==0&&dy==0)continue
                    val xx=x+dx;val yy=y+dy
                    if(xx in 0 until w&&yy in 0 until h)add(yy*w+xx)
                }
            }
        }
        // Correct only boundary pixels: estimate foreground from a point two pixels inward,
        // then solve the original pixel as a mixture of that foreground and key colour.
        val corrected=HashMap<Int,Int>()
        for(i in 0 until n){if(erased[i]||Color.alpha(pixels[i])==0)continue
            val x=i%w;val y=i/w;val current=pixels[i]
            var lowest=Double.POSITIVE_INFINITY;var result:Int?=null
            for(dy in -1..1)for(dx in -1..1){if(dx==0&&dy==0)continue
                val bx=x+dx;val by=y+dy;val fx=x-2*dx;val fy=y-2*dy
                if(bx !in 0 until w||by !in 0 until h||fx !in 0 until w||fy !in 0 until h)continue
                if(!erased[by*w+bx]||erased[fy*w+fx])continue
                val fg=pixels[fy*w+fx];if(Color.alpha(fg)==0)continue
                val bg=palette[nearest(pixels[by*w+bx])]
                val diff=doubleArrayOf((Color.red(fg)-Color.red(bg)).toDouble(),(Color.green(fg)-Color.green(bg)).toDouble(),(Color.blue(fg)-Color.blue(bg)).toDouble())
                val den=diff.sumOf{it*it};if(den<400)continue
                val currentColor=doubleArrayOf(Color.red(current).toDouble(),Color.green(current).toDouble(),Color.blue(current).toDouble())
                val bgColor=doubleArrayOf(Color.red(bg).toDouble(),Color.green(bg).toDouble(),Color.blue(bg).toDouble())
                val alpha=(0..2).sumOf{k->diff[k]*(currentColor[k]-bgColor[k])}/den
                if(alpha<=.06||alpha>=.97)continue
                val residual=sqrt((0..2).sumOf{k->(currentColor[k]-bgColor[k]-alpha*diff[k]).let{it*it}})
                if(residual>12||residual>=lowest)continue
                val channels=(0..2).map{k->((currentColor[k]-(1-alpha)*bgColor[k])/alpha).roundToInt().coerceIn(0,255)}
                result=Color.argb((Color.alpha(current)*alpha).roundToInt().coerceIn(0,255),channels[0],channels[1],channels[2]);lowest=residual
            }
            if(result!=null)corrected[i]=result
        }
        for(i in 0 until n){if(erased[i])pixels[i]=Color.TRANSPARENT else corrected[i]?.let{pixels[i]=it}}
        return Bitmap.createBitmap(pixels,w,h,Bitmap.Config.ARGB_8888)
    }
}
