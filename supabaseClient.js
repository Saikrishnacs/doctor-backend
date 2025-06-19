require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');


const supabase = createClient(
  'https://ioulggtqzjjikbxszsmv.supabase.co',         // replace with your Supabase URL
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvdWxnZ3RxempqaWtieHN6c212Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDI2MzIxOCwiZXhwIjoyMDY1ODM5MjE4fQ.7puJBG7eFGIRrcTORgqU_HOnGMN4DN6jdNum_zGZXXQ'                    // use service role key (not anon key)
);
module.exports=supabase;