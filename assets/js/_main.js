(function(){
    /*! Plugin options and other jQuery stuff */

    /*! Global JavaScript Initialize */
    var Global={
      DEBUG:false,
      log:function(m){
        if(Global.DEBUG){
          console.log(m);
        }
      },
      tmpl:{
        post_list: '<article class="entry" itemscope="">'+
                   '  <div class="entry-wrapper">'+
                   '   <div class="entry-content" itemprop="<%=description%>">'+
                   '     <% if(typeof posts == "undefined" || posts == null || posts.length ==0){%>'+
                   '     Not posts found for your request.'+
                   '     <% }else{ %>'+
                   '     <ul class="post-list">'+
                   '       <% posts.forEach(function(i){ %>'+
                   '         <li>'+
                   '           <article itemprop="blogPost" itemscope="" itemtype="http://schema.org/BlogPosting" data-tag-ruby="" data-tag-rvm="">'+
                   '           <a href="<%=i.url %>">'+
                   '           <%=i.title %>'+
                   '           <span class="entry-date">'+
                   '             <time datetime="<%=i.date %>"><%=i.date %></time>'+
                   '           </span>'+
                   '           </a>'+
                   '           </article>'+
                   '         </li>'+
                   '       <% })%>'+
                   '       </ul>'+
                   '     <% } %>'+
                   '   </div><!-- /.entry-content -->'+
                   ' </div><!-- /.entry-wrapper -->'+
                   ' </article>'
      },
      nav:$('#site-nav'),
      site_header:$(".site-header"),
      _init:function(){
        Global.log("loading global")
        // Global._smoothscroll();
        Global._nav();
        Global._img();
        Global._article();
      },
      _smoothscroll:function(){
        Global.log("\tloading smoothscroll")
        $('a[href*=#]:not([href=#])').click(function() {
          if (location.pathname.replace(/^\//,'') == this.pathname.replace(/^\//,'')
              || location.hostname == this.hostname) {

            var target = $(this.hash);
            target = target.length ? target : $('[name=' + this.hash.slice(1) +']');
            if (target.length) {
              if(target.css("visibility") == "hidden" || target.css("display") == "none"){
                  target.css('display','block')
                  target.css('visibility','visible')
              }
              var mi = $(".site-header.fixed-top").height()
              mi = mi ? mi:0
              $('html,body').animate({
                scrollTop: target.offset().top-mi
              }, 1000);
              return false;
            }
          }
        });
      },
      _img:function(){
        Global.log("\tloading img")
        // *** Magnific-Popup options ***
        // Add lightbox class to all image links
        $("a[href$='.jpg'],a[href$='.png'],a[href$='.gif']").addClass("image-popup");
        $('.image-popup').magnificPopup({
          type: 'image',
          tLoading: 'Loading image #%curr%...',
          gallery: {
            enabled: true,
            navigateByImgClick: true,
            preload: [0,1] // Will preload 0 - before current, and 1 after the current image
          },
          image: {
            tError: '<a href="%url%">Image #%curr%</a> could not be loaded.',
          },
          removalDelay: 300, // Delay in milliseconds before popup is removed
          // Class that is added to body when popup is open.
          // make it unique to apply your CSS animations just to this exact popup
          mainClass: 'mfp-fade'
        });

        // Lazy Load
        $("img.load").show().lazyload({
            effect : "fadeIn"
        });
      },
      _article:function(){
        Global.log("\tloading article")
        // FitVids options
        $("article").fitVids();
      },
      _nav:function(){
        // Global.log("\t loading nav")
        // $('#site-nav ul li a[href=#]').click(function(e){
        //   var dm = $(this).parent().children("ul.dropdown-menu")
        //   Global.log(dm)
        //   if(dm.hasClass("dropdown-menu-show")){
        //     Global.log("\t->hide()")
        //     dm.animate({top:-1*dm.height()})
        //     dm.removeClass("dropdown-menu-show")
        //   }else{
        //     Global.log("\t->show()")
        //     dm.show();
        //     dm.animate({top:0})
        //     dm.addClass("dropdown-menu-show")
        //   }
        // })

        // $("ul.dropdown-menu li.close-btn a").click(function(){
        //     var dm = $(this).parent().parent()
        //     Global.log("\t->hide()")
        //     dm.animate({top:-1*dm.height()})
        //     dm.removeClass("dropdown-menu-show")
        // })

        Global.log("\t loading nav");
        $("#site-nav .sub .sub-x").bind("click",function(){
          $(this).parent().css("display","none");
        });

        $("#site-nav nav a").bind("click",function(e){
          var subnav = $(this).attr("data-subnav");
          if(typeof subnav != 'undefined'){
            e.preventDefault();
          }
          if(typeof subnav != 'undefined' && subnav.length > 0){
            var t=$("#site-nav "+subnav);
            $(".sub > div").css("display","none");
            t.css("display","block");
            $(".sub").css("display","block");
          }
        })

        // tag click
        $("#site-nav .sub #tags a").bind("click",function(e){
          e.preventDefault();
          var tag = $(this).attr("data-tag");
          var posts = [];
          $.get("/api/articles.json",function(d){
            Global.log(d);
            d.data.forEach(function(i){
              if(i && typeof i['tags'] != 'undefined' && i.tags.indexOf(tag)>=0){
                posts.push(i);
              }
            });
            Global.log(posts);
            Global.log(Global.tmpl);

            var post_html=_.template(Global.tmpl.post_list,{
              title: "Post with tag "+tag,
              description:"Post with tag "+tag,
              posts: posts
            });
            Global.log(post_html);
            $("#main").html(post_html);
          })
        });
      }
    }/*-End of Global -*/

    /*! Page JavaScript Initialize */
    var Page = {
      _init:function(){
        Global.log("loading page")
        Page.home()
        Page.tag()
      },
      home:function(){
        Global.log("\tloading home")
      },
      tag:function(){
        Global.log("\tloading cloud")
        $("ul.tag-box li a").click(function(e){
            e.preventDefault()
            Global.log($(this))
            $("ul.post-list li").hide();
            $("ul.post-list li").removeClass("hidden");
            Global.log($("ul.post-list li article[data-tag-"+$(this).attr("data-tag")+"]"))
            $("ul.post-list li article[data-tag-"+$(this).attr("data-tag")+"]").parent().fadeIn()
        })
      }
    }
    /*- End of Page -*/

    // ===============================
    // Main Entry
    // *** When document ready    ***
    // ===============================
    $(document).ready(function() {
      Global._init();
      Page._init();
    });
})()
