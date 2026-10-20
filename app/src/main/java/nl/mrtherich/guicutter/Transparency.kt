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
        val erased=BooleanArray(n);val matches=BooleanArray(n);val nearest=IntArray(n);val core=BooleanArray(n)
        val tolerance=settings.optDouble("tolerance",20.0).coerceIn(0.0,100.0)
        val threshold=2.0+1.25*tolerance
        val darkest=maxOf(.55,1-tolerance*.012)
        val shadowResidual=5+tolerance*.25
        val jumpLimit=minOf(55.0,maxOf(16.0,16+tolerance*.35))
        fun distance(pixel:Int,color:Int):Double {
            val r=(Color.red(pixel)-Color.red(color)).toDouble()
            val g=(Color.green(pixel)-Color.green(color)).toDouble()
            val b=(Color.blue(pixel)-Color.blue(color)).toDouble()
            return sqrt(.299*r*r+.587*g*g+.114*b*b)
        }
        fun rgbDistance(r:Double,g:Double,b:Double):Double = sqrt(.299*r*r+.587*g*g+.114*b*b)
        for(i in 0 until n){
            val pixel=pixels[i];if(Color.alpha(pixel)==0)continue
            var best=Double.POSITIVE_INFINITY;var strict=Double.POSITIVE_INFINITY;var key=0
            for(j in palette.indices){
                val bg=palette[j];val d=distance(pixel,bg)
                if(d<best){best=d;key=j}
                if(d<strict)strict=d
                if(d<=threshold)continue
                val br=Color.red(bg).toDouble();val bgc=Color.green(bg).toDouble();val bb=Color.blue(bg).toDouble()
                val norm=br*br+bgc*bgc+bb*bb
                if(norm<2000)continue
                val shade=(Color.red(pixel)*br+Color.green(pixel)*bgc+Color.blue(pixel)*bb)/norm
                if(shade<darkest||shade>1)continue
                val residual=rgbDistance(Color.red(pixel)-br*shade,Color.green(pixel)-bgc*shade,Color.blue(pixel)-bb*shade)
                if(residual<=shadowResidual){
                    val score=threshold*.5+maxOf(0.0,1-shade)*50
                    if(score<best){best=score;key=j}
                }
            }
            nearest[i]=key
            if(best<=threshold)matches[i]=true
            if(strict<=maxOf(4.0,threshold*.4))core[i]=true
        }
        if(settings.optBoolean("all",false)){
            for(i in 0 until n)erased[i]=matches[i]
        }else{
            // Perimeter seeds, four-connected only; reject transitions across
            // sharp foreground boundaries even at a high colour tolerance.
            val queue=IntArray(n);var head=0;var tail=0
            fun add(i:Int,from:Int=-1){
                if(!matches[i]||erased[i])return
                if(from>=0 && distance(pixels[i],pixels[from])>jumpLimit &&
                    !(core[i]&&core[from]&&nearest[i]!=nearest[from]))return
                erased[i]=true;queue[tail++]=i
            }
            for(x in 0 until w){add(x);add((h-1)*w+x)}
            for(y in 0 until h){add(y*w);add(y*w+w-1)}
            while(head<tail){val i=queue[head++];val x=i%w;val y=i/w
                if(x>0)add(i-1,i)
                if(x+1<w)add(i+1,i)
                if(y>0)add(i-w,i)
                if(y+1<h)add(i+w,i)
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
                val bg=palette[nearest[by*w+bx]]
                val diff=doubleArrayOf((Color.red(fg)-Color.red(bg)).toDouble(),(Color.green(fg)-Color.green(bg)).toDouble(),(Color.blue(fg)-Color.blue(bg)).toDouble())
                val den=diff.sumOf{it*it};if(den<400)continue
                val currentColor=doubleArrayOf(Color.red(current).toDouble(),Color.green(current).toDouble(),Color.blue(current).toDouble())
                val bgColor=doubleArrayOf(Color.red(bg).toDouble(),Color.green(bg).toDouble(),Color.blue(bg).toDouble())
                val alpha=(0..2).sumOf{k->diff[k]*(currentColor[k]-bgColor[k])}/den
                if(alpha<=.06||alpha>=.97)continue
                val residual=sqrt((0..2).sumOf{k->(currentColor[k]-bgColor[k]-alpha*diff[k]).let{it*it}})
                if(residual>14||residual>=lowest)continue
                val channels=(0..2).map{k->((currentColor[k]-(1-alpha)*bgColor[k])/alpha).roundToInt().coerceIn(0,255)}
                result=Color.argb((Color.alpha(current)*alpha).roundToInt().coerceIn(0,255),channels[0],channels[1],channels[2]);lowest=residual
            }
            if(result!=null)corrected[i]=result
        }
        for(i in 0 until n){if(erased[i])pixels[i]=Color.TRANSPARENT else corrected[i]?.let{pixels[i]=it}}
        return Bitmap.createBitmap(pixels,w,h,Bitmap.Config.ARGB_8888)
    }
}
