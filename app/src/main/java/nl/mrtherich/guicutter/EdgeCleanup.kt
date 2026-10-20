package nl.mrtherich.guicutter

import android.graphics.Bitmap
import android.graphics.Color
import kotlin.math.roundToInt

/** Post-key alpha-edge repair. Keep in sync with edge-cleanup.mjs. */
object EdgeCleanup {
    fun apply(source: Bitmap, rawAmount: Int): Bitmap {
        val amount=rawAmount.coerceIn(0,100)
        if(amount==0 || source.width<2 || source.height<2)return source
        val w=source.width;val h=source.height
        val before=IntArray(w*h)
        source.getPixels(before,0,w,0,0,w,h)
        val after=before.copyOf()
        val strength=amount/100.0
        val dxs=intArrayOf(-1,0,1,-1,1,-1,0,1)
        val dys=intArrayOf(-1,-1,-1,0,0,1,1,1)
        val weights=intArrayOf(1,2,1,2,2,1,2,1)
        for(y in 0 until h)for(x in 0 until w){
            val i=y*w+x
            val original=before[i];val alpha=Color.alpha(original)
            if(alpha==0)continue
            var sum=alpha*4;var hasBackground=false;var support=0
            for(k in dxs.indices){
                val xx=x+dxs[k];val yy=y+dys[k]
                val neighbour=if(xx<0||xx>=w||yy<0||yy>=h)alpha else Color.alpha(before[yy*w+xx])
                sum+=weights[k]*neighbour
                if(neighbour<32)hasBackground=true
                if(neighbour>=128)support++
            }
            if(!hasBackground)continue
            val smoothed=(sum/16.0).roundToInt()
            var result=(alpha+(minOf(alpha,smoothed)-alpha)*strength).roundToInt()
            if(support<=2)result=(result*(1-.9*strength)).roundToInt()
            else if(support==3)result=(result*(1-.27*strength*strength)).roundToInt()
            var red=Color.red(original);var green=Color.green(original);var blue=Color.blue(original)
            if(alpha<250&&result in 1..244){
                var best=-1;var score=-1
                for(dy in -2..2)for(dx in -2..2){
                    val xx=x+dx;val yy=y+dy
                    if(xx<0||xx>=w||yy<0||yy>=h||(dx==0&&dy==0))continue
                    val q=before[yy*w+xx];val qa=Color.alpha(q)
                    if(qa<240)continue
                    val quality=qa*8-10*(dx*dx+dy*dy)
                    if(quality>score){score=quality;best=yy*w+xx}
                }
                if(best>=0){
                    val interior=before[best]
                    val blend=minOf(.32,strength*.40*(1-result/255.0))
                    red=(red*(1-blend)+Color.red(interior)*blend).roundToInt()
                    green=(green*(1-blend)+Color.green(interior)*blend).roundToInt()
                    blue=(blue*(1-blend)+Color.blue(interior)*blend).roundToInt()
                }
            }
            after[i]=Color.argb(result,red,green,blue)
        }
        return Bitmap.createBitmap(after,w,h,Bitmap.Config.ARGB_8888)
    }
}
