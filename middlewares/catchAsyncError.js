export const catchAsyncErrors = (theFunction) =>{
return (req,res,next)=>{
promises.resolve(theFunction(req,res,next)).catch(next);

};
};