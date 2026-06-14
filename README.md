## `Introduction` 


TubeForecaster is a web application that helps YouTube content creators predict
statistics based on their several informations as inputs:



YouTube Channel URL
Video Idea / Working title
Niche
Video length
Target audience (optional)
Thumbnail (optional)



TubeForecaster will release an output of AI analysis operated by OpenRouter:



Rating of title length
Rating of uppercase ratio
Rating of distinct keywords
An overall grade on the idea
Predicted views
Predicted CTR
Average retention
Report of statistics of similar videos
Overview of strengths and weaknesses
Suggestion on improvisation



Users will also be able to save the report as a PNG or PDF.
If users are unhappy with the result, there is a “re-roll” option for
TubeForecaster to make another analysis report.



How to run it locally



Download the ZIP file
Install Node.js 18.12.0
Go to the root directory of the project folder
Run “npm install”
Create a “.env.local” file in the root directory of the project folder and
implement API keys
Run “npm run dev”
Open https://localhost:3000.



If you want to use it without running it locally, open the link: https://yt-
idea-checker.vercel.app/



Research Paper Application
Research Paper:
Hoiles, William. “Engagement Dynamics and Sensitivity Analysis of YouTube
Videos.” Arxiv, 2 Nov. 2016, arxiv.org/pdf/1611.00687.



Summary of the Research:



Discussed how some video characteristics can affect the popularity of a video on
social media. The characteristics include title length, keyword usage, and
capitalization.



Meta-feature analysis feature was operated by how ForecastForm.js integrates the
information from Engagement dynamics and sensitivity and analysis of YouTube
videos by William Hoiles to report an overall scoring of title length, uppercase
ratio, and distinct keywords.



Primary Contributions



Ayaan Ramin
Developed an early prototype that was continued in use
Designed the backend



Integrated AI API
Developed the scoring system
Implement research-paper based feature
Developed an early prototype that was continued in use


## `Xuhao Zhang` 


Developed an early prototype that was abandoned due to lack of demonstration in
progress
Helped planning project concept
Participated in testing and feedback
Overall progress report in the README file



Working with an AI Agent



Xuhao Zhang - We built the meta-feature analysis feature with the AI agency's
assistance through prompts that ask for guidance in the basic understanding of
the feature, the basic data requirements, and understanding of the
implementation.  One thing that worked well was how we used agent assistance for
the design and construction of the UI frontend which demonstrated efficiency and
sophistication. However, one part that AI agencies didn’t work well on was how
the AI agency created its own file structures that seemed messy and had some
early issues with communicating properly with the backend. One thing we learned
about prompting was to provide sufficient background knowledge and specific
detail when requesting for desired outcome. As a result of our learning
experience, we would spend more time on planning ahead for our project to avoid
AI agencies from building codes that may contribute to future mistakes.



Ayaan Ramin - The AI helped us in multiple ways. It helped us not only create,
but also understand what was needed for both the backend and frontend of the
app. Furthermore, it also guided us through getting and implementing the API
keys we needed to get information from Youtube and put it through the AI into
the files. Something that worked well for us is the implementation of a
chooseable niche for the video idea. Personally, I didn’t think the feature
would come out this well-integrated. The AI even affects the “score” of the
video based on which niche the user chose. For example, if the user chooses a
Tech niche when the video idea isn’t remotely about technology, the score goes
down. One thing the AI needed a lot of correction on was the integration of
inputting thumbnails. It took a while to find an AI model from OpenRouter that
actually was able to view the thumbnails being uploaded into the website. At
times, the AI would “hallucinate,” meaning it would write text about the
thumbnail without even being able to view it, so it would guess about what it
would look like instead. This was a little confusing to work with, but
eventually the AI was able to fix this problem. About prompting, we learned that
it's best to give AI the most information about the problem as possible. For
example, if you get an error in the console and you want to fix it using AI, it
would be best to copy and paste the entire error message into AI so it 100%
understands what is going wrong. If we were to do this project again, I think we
would change the extent to which we try to understand the code and debugging
process ourselves before asking the AI for solutions. This would help us
collaborate with the AI more effectively throughout the project.


